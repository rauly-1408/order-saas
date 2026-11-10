import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { isPartner, priceListTenant, readPrices } from "@/app/lib/priceLists";
import { cleanText } from "@/app/lib/text";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Una carta de delivery. PATCH con uno de:
//   { name }                         → renombrar
//   { channels: ["glovo", …] }       → a qué plataformas va (se quitan de otras cartas)
//   { productId, cents | null }      → precio de un plato (null = el del local)
//   { productId, offered: boolean }  → ofrecer o quitar un plato de esta carta
// DELETE → borrarla. Solo el gerente. Ver docs/REPARTO-PLATAFORMAS.md
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  try {
    const a = await priceListTenant(req);
    if ("error" in a) return a.error;
    const { id } = await params;
    const list = await prisma.priceList.findFirst({ where: { id, tenantId: a.tenant.id } });
    if (!list) return NextResponse.json({ error: "Carta no encontrada" }, { status: 404 });
    const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

    if ("name" in b) {
      const name = cleanText(b.name, 60);
      if (!name) return NextResponse.json({ error: "Ponle un nombre a la carta" }, { status: 400 });
      await prisma.priceList.update({ where: { id }, data: { name } });
      return NextResponse.json({ ok: true });
    }
    if ("channels" in b) {
      if (!Array.isArray(b.channels) || !b.channels.every(isPartner)) return NextResponse.json({ error: "Plataforma no válida" }, { status: 400 });
      const channels = [...new Set(b.channels)];
      await prisma.$transaction(async (tx) => {
        const others = await tx.priceList.findMany({ where: { tenantId: a.tenant.id, id: { not: id }, channels: { hasSome: channels } }, select: { id: true, channels: true } });
        for (const o of others) await tx.priceList.update({ where: { id: o.id }, data: { channels: o.channels.filter((c) => !channels.includes(c as never)) } });
        await tx.priceList.update({ where: { id }, data: { channels } });
      });
      return NextResponse.json({ ok: true });
    }
    if (typeof b.productId === "string") {
      const product = await prisma.product.findFirst({ where: { id: b.productId, tenantId: a.tenant.id }, select: { id: true } });
      if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
      if ("offered" in b) {
        const hidden = b.offered === false ? [...new Set([...list.hidden, product.id])] : list.hidden.filter((h) => h !== product.id);
        await prisma.priceList.update({ where: { id }, data: { hidden } });
        return NextResponse.json({ ok: true });
      }
      const cents = b.cents === null ? null : Number(b.cents);
      if (cents !== null && (!Number.isInteger(cents) || cents < 0 || cents > 100_000)) return NextResponse.json({ error: "Precio no válido" }, { status: 400 });
      const prices = readPrices(list.prices);
      if (cents === null) delete prices[product.id];
      else prices[product.id] = cents;
      await prisma.priceList.update({ where: { id }, data: { prices } });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Nada que cambiar" }, { status: 400 });
  } catch (err) {
    console.error("[PATCH /api/admin/cartas-delivery]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const a = await priceListTenant(req);
  if ("error" in a) return a.error;
  const { id } = await params;
  const r = await prisma.priceList.deleteMany({ where: { id, tenantId: a.tenant.id } });
  if (!r.count) return NextResponse.json({ error: "Carta no encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
