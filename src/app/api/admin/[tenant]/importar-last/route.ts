import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { sniffImage } from "@/app/lib/brand";
import { ALLERGENS } from "@/app/lib/costs";
import { DIET_TAGS, parseDietTags } from "@/app/lib/diet";
import { imageUrl, MAX_IMAGE_BYTES } from "@/app/lib/media";
import { lastImageUrl, lastStoreUrl, matchProducts, parseLastStore, type LastProduct } from "@/app/lib/lastImport";
import { revalidateMenu } from "@/app/lib/menuCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Carta → «Importar de Last.app»: fotos, alérgenos y sellos de la tienda que el
// restaurante tenía en Last. Sin `apply` devuelve la propuesta de parejas; con
// `apply` lo guarda. Alérgenos y sellos se SUMAN a los que ya hay (nunca se quita
// un alérgeno). Ver docs/IMPORTAR-LAST.md

async function readStore(raw: unknown): Promise<LastProduct[] | { error: string }> {
  const url = lastStoreUrl(raw);
  if (!url) return { error: "Pega la dirección de tu tienda de Last.app (por ejemplo https://tutienda.last.shop)" };
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (importador de carta)" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!res.ok) return { error: `Last.app respondió ${res.status}. Revisa la dirección.` };
    const html = await res.text();
    if (html.length > 10_000_000) return { error: "La página es demasiado grande" };
    const products = parseLastStore(html);
    return products.length ? products : { error: "No hemos encontrado productos en esa página de Last.app" };
  } catch {
    return { error: "No se pudo abrir la tienda de Last.app. Inténtalo de nuevo." };
  }
}

async function downloadPhoto(imageId: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(lastImageUrl(imageId), { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length && bytes.length <= MAX_IMAGE_BYTES && sniffImage(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/")[3];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const theirs = await readStore(body.url);
  if ("error" in theirs) return NextResponse.json({ error: theirs.error }, { status: 400 });

  const ours = await prisma.product.findMany({
    where: { tenantId: tenant.id, isCombo: false },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, imageUrl: true, allergens: true, dietTags: true, category: { select: { name: true } } },
  });

  // 1) Propuesta: nuestros productos, los de Last y la pareja sugerida.
  if (!Array.isArray(body.apply)) {
    const matches = Object.fromEntries(matchProducts(ours, theirs).map((m) => [m.product.id, m.last.name]));
    return NextResponse.json({
      products: ours.map((p) => ({ id: p.id, name: p.name, category: p.category.name, imageUrl: p.imageUrl })),
      last: theirs.map((t) => ({ name: t.name, thumb: t.imageId ? lastImageUrl(t.imageId).replace("w_1000,h_1000", "w_160,h_160") : null, allergens: t.allergens, diet: t.diet })),
      matches,
    });
  }

  // 2) Importar lo elegido.
  const what = { photos: body.photos !== false, allergens: body.allergens !== false, diet: body.diet !== false };
  const byName = new Map(theirs.map((t) => [t.name, t]));
  const ourById = new Map(ours.map((p) => [p.id, p]));
  const pairs = (body.apply as unknown[])
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .map((x) => ({ product: ourById.get(String(x.productId)), last: byName.get(String(x.lastName)) }))
    .filter((x): x is { product: (typeof ours)[number]; last: LastProduct } => !!x.product && !!x.last)
    .slice(0, 300);
  if (!pairs.length) return NextResponse.json({ error: "Elige al menos un producto" }, { status: 400 });

  const result = { photos: 0, allergens: 0, diet: 0, failed: [] as string[] };
  const queue = [...pairs];
  const worker = async () => {
    for (let pair = queue.shift(); pair; pair = queue.shift()) {
      const { product, last } = pair;
      const data: { imageUrl?: string; allergens?: string[]; dietTags?: string[] } = {};
      if (what.photos && last.imageId) {
        const bytes = await downloadPhoto(last.imageId);
        if (bytes) {
          const file = await prisma.mediaFile.create({
            data: { tenantId: tenant.id, kind: "IMAGE", name: `${product.name}.jpg`.slice(0, 120), mimeType: sniffImage(bytes)!, size: bytes.length, width: 1000, height: 1000, data: Buffer.from(bytes) },
            select: { id: true },
          });
          data.imageUrl = imageUrl(tenant.slug, file.id);
          result.photos++;
        } else result.failed.push(product.name);
      }
      if (what.allergens && last.allergens.length) {
        const merged = ALLERGENS.filter((a) => product.allergens.includes(a) || last.allergens.includes(a));
        if (merged.length !== product.allergens.length) {
          data.allergens = merged;
          result.allergens++;
        }
      }
      if (what.diet && last.diet.length) {
        const merged = DIET_TAGS.filter((t) => parseDietTags(product.dietTags).includes(t) || last.diet.includes(t));
        if (merged.length !== product.dietTags.length) {
          data.dietTags = merged;
          result.diet++;
        }
      }
      if (Object.keys(data).length) await prisma.product.update({ where: { id: product.id }, data });
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  await revalidateMenu(tenant.id);
  return NextResponse.json(result);
}
