import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { applyStockDeltas } from "@/app/lib/inventory";
import { recordPriceChange } from "@/app/lib/purchasing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { supplierId?, documentNumber?, lines: [{ ingredientId, quantity, packPriceCents? }] }
// Aplica un albarán ya revisado: entrada de stock (RECEIPT) y, si cambió el
// precio de un formato, actualiza el ingrediente y lo deja en el historial.
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(b.lines) ? b.lines : [];
  const lines: { ingredientId: string; quantity: number; packPriceCents: number | null }[] = [];
  for (const r of raw) {
    const l = (r ?? {}) as Record<string, unknown>;
    const quantity = Number(l.quantity);
    const price = l.packPriceCents == null || l.packPriceCents === "" ? null : Number(l.packPriceCents);
    if (typeof l.ingredientId !== "string" || !(quantity >= 0) || (price != null && !(Number.isInteger(price) && price >= 0))) {
      return NextResponse.json({ error: "Cantidad o precio no válido" }, { status: 400 });
    }
    lines.push({ ingredientId: l.ingredientId, quantity, packPriceCents: price });
  }
  if (!lines.length) return NextResponse.json({ error: "No hay líneas que aplicar" }, { status: 400 });

  const ingredients = await prisma.ingredient.findMany({
    where: { tenantId, id: { in: [...new Set(lines.map((l) => l.ingredientId))] } },
    select: { id: true, packSize: true, packPriceCents: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  if (byId.size !== new Set(lines.map((l) => l.ingredientId)).size) {
    return NextResponse.json({ error: "Algún ingrediente no existe" }, { status: 400 });
  }

  const supplier =
    typeof b.supplierId === "string" ? await prisma.supplier.findFirst({ where: { id: b.supplierId, tenantId }, select: { name: true } }) : null;
  const docNumber = typeof b.documentNumber === "string" && b.documentNumber.trim() ? b.documentNumber.trim().slice(0, 60) : null;
  const note = ["Albarán", docNumber && `nº ${docNumber}`, supplier && `de ${supplier.name}`].filter(Boolean).join(" ");

  let priceChanges = 0;
  await prisma.$transaction(async (tx) => {
    const deltas = new Map<string, number>();
    const updatedPrice = new Set<string>();
    for (const l of lines) {
      if (l.quantity > 0) deltas.set(l.ingredientId, (deltas.get(l.ingredientId) ?? 0) + l.quantity);
      const ing = byId.get(l.ingredientId)!;
      // Un mismo ingrediente en dos líneas: vale el primer precio distinto.
      if (l.packPriceCents != null && l.packPriceCents !== ing.packPriceCents && !updatedPrice.has(ing.id)) {
        updatedPrice.add(ing.id);
        await tx.ingredient.update({ where: { id: ing.id }, data: { packPriceCents: l.packPriceCents } });
        await recordPriceChange(tx, tenantId, ing.id, ing, { packSize: ing.packSize, packPriceCents: l.packPriceCents }, "RECEIPT");
        priceChanges++;
      }
    }
    if (deltas.size) {
      await tx.ingredient.updateMany({ where: { id: { in: [...deltas.keys()] }, tenantId }, data: { trackStock: true } });
      await applyStockDeltas(tx, tenantId, deltas, "RECEIPT", { note });
    }
  });

  return NextResponse.json({ ok: true, stockLines: lines.filter((l) => l.quantity > 0).length, priceChanges });
}
