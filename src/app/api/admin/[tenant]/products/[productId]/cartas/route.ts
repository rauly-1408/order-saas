import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { productImageUrl } from "@/app/lib/media";
import { revalidateMenu } from "@/app/lib/menuCache";
import { priceListTenant, readDescriptions, readImages, readPrices } from "@/app/lib/priceLists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un plato en las cartas delivery («¿Dónde se vende?» al añadir o editar un
// producto, y la ficha del plato dentro de una carta).
// GET → en qué cartas está, con su precio, descripción y foto propios.
// PUT { lists: [{ id, offered, priceCents|null, description, imageUrl }] } → los guarda.
// Vacío = lo mismo que en el local. Solo el gerente. Ver docs/REPARTO-PLATAFORMAS.md
type Item = { id: string; offered: boolean; priceCents: number | null; description: string; imageUrl: string };

async function load(req: NextRequest, params: Promise<{ tenant: string; productId: string }>) {
  const a = await priceListTenant(req);
  if ("error" in a) return a;
  const { tenant: slug, productId } = await params;
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId: a.tenant.id }, select: { id: true } });
  if (!product) return { error: NextResponse.json({ error: "Producto no encontrado" }, { status: 404 }) };
  return { tenantId: a.tenant.id, slug, productId };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string; productId: string }> }) {
  const c = await load(req, params);
  if ("error" in c) return c.error;
  const lists = await prisma.priceList.findMany({ where: { tenantId: c.tenantId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({
    lists: lists.map((l) => ({
      id: l.id,
      name: l.name,
      channels: l.channels,
      offered: !l.hidden.includes(c.productId),
      priceCents: readPrices(l.prices)[c.productId] ?? null,
      description: readDescriptions(l.descriptions)[c.productId] ?? "",
      imageUrl: readImages(l.images)[c.productId] ?? "",
    })),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ tenant: string; productId: string }> }) {
  try {
    const c = await load(req, params);
    if ("error" in c) return c.error;
    const b = ((await req.json().catch(() => null)) ?? {}) as { lists?: unknown };
    if (!Array.isArray(b.lists)) return NextResponse.json({ error: "Nada que guardar" }, { status: 400 });
    const items: Item[] = [];
    for (const raw of b.lists as Record<string, unknown>[]) {
      const price = raw.priceCents === null || raw.priceCents === undefined ? null : Number(raw.priceCents);
      if (price !== null && (!Number.isInteger(price) || price < 0 || price > 100_000)) return NextResponse.json({ error: "Precio no válido" }, { status: 400 });
      const img = productImageUrl(raw.imageUrl, c.slug);
      if ("error" in img) return NextResponse.json({ error: img.error }, { status: 400 });
      items.push({ id: String(raw.id ?? ""), offered: raw.offered !== false, priceCents: price, description: typeof raw.description === "string" ? raw.description.replace(/\s+/g, " ").trim().slice(0, 500) : "", imageUrl: img.value ?? "" });
    }
    await prisma.$transaction(async (tx) => {
      for (const it of items) {
        const l = await tx.priceList.findFirst({ where: { id: it.id, tenantId: c.tenantId } });
        if (!l) continue;
        const prices = readPrices(l.prices);
        const descriptions = readDescriptions(l.descriptions);
        const images = readImages(l.images);
        if (it.priceCents == null) delete prices[c.productId];
        else prices[c.productId] = it.priceCents;
        if (it.description) descriptions[c.productId] = it.description;
        else delete descriptions[c.productId];
        if (it.imageUrl) images[c.productId] = it.imageUrl;
        else delete images[c.productId];
        const hidden = it.offered ? l.hidden.filter((h) => h !== c.productId) : [...new Set([...l.hidden, c.productId])];
        await tx.priceList.update({ where: { id: l.id }, data: { prices, descriptions, images, hidden } });
      }
    });
    after(() => revalidateMenu(c.tenantId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PUT /api/admin/products/cartas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
