import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { PARTNERS, parsePartners } from "@/app/lib/deliveryPartners";
import { MAX_PRICE_LISTS, priceListTenant, readDescriptions, readImages, readPrices } from "@/app/lib/priceLists";
import { cleanText } from "@/app/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Carta → «Cartas delivery». GET → las cartas, las plataformas y los platos.
// POST { name, copyFrom? } → carta nueva con los precios del local o copia de
// otra carta («Duplicar»). Solo el gerente. Ver docs/REPARTO-PLATAFORMAS.md
export async function GET(req: NextRequest) {
  const a = await priceListTenant(req);
  if ("error" in a) return a.error;
  const links = parsePartners((a.tenant.settings as Record<string, unknown> | null)?.deliveryPartners);
  const [lists, categories] = await Promise.all([
    prisma.priceList.findMany({ where: { tenantId: a.tenant.id }, orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({
      where: { tenantId: a.tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, products: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true, imageUrl: true, basePriceCents: true, isActive: true } } },
    }),
  ]);
  return NextResponse.json({
    platforms: PARTNERS.map((p) => ({ key: p.key, label: p.label, added: !!links[p.key] })),
    lists: lists.map((l) => ({ id: l.id, name: l.name, channels: l.channels, prices: readPrices(l.prices), descriptions: readDescriptions(l.descriptions), images: readImages(l.images), hidden: l.hidden, updatedAt: l.updatedAt })),
    categories: categories.filter((c) => c.products.length),
  });
}

export async function POST(req: NextRequest) {
  try {
    const a = await priceListTenant(req);
    if ("error" in a) return a.error;
    const b = ((await req.json().catch(() => null)) ?? {}) as { name?: unknown; copyFrom?: unknown };
    const name = cleanText(b.name, 60);
    if (!name) return NextResponse.json({ error: "Ponle un nombre a la carta" }, { status: 400 });
    if ((await prisma.priceList.count({ where: { tenantId: a.tenant.id } })) >= MAX_PRICE_LISTS) return NextResponse.json({ error: `Como mucho ${MAX_PRICE_LISTS} cartas` }, { status: 400 });
    let prices: Record<string, number>;
    let hidden: string[] = [];
    let descriptions: Record<string, string> = {};
    let images: Record<string, string> = {};
    if (typeof b.copyFrom === "string" && b.copyFrom) {
      const src = await prisma.priceList.findFirst({ where: { id: b.copyFrom, tenantId: a.tenant.id } });
      if (!src) return NextResponse.json({ error: "No encontramos la carta a duplicar" }, { status: 404 });
      prices = readPrices(src.prices);
      hidden = src.hidden;
      descriptions = readDescriptions(src.descriptions);
      images = readImages(src.images);
    } else {
      // Empieza con los precios del local, para cambiar a mano los que quieras.
      const products = await prisma.product.findMany({ where: { tenantId: a.tenant.id }, select: { id: true, basePriceCents: true } });
      prices = Object.fromEntries(products.map((p) => [p.id, p.basePriceCents]));
    }
    // La copia no se lleva las plataformas: cada plataforma usa una sola carta.
    const list = await prisma.priceList.create({ data: { tenantId: a.tenant.id, name, prices, hidden, descriptions, images, channels: [] } });
    return NextResponse.json({ id: list.id }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/admin/cartas-delivery]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
