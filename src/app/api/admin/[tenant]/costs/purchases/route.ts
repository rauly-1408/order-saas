import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: crea un pedido a proveedor (borrador) con el precio actual de cada ingrediente.
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (typeof b.supplierId !== "string" || !Array.isArray(b.lines) || b.lines.length === 0) {
    return NextResponse.json({ error: "Indica proveedor y al menos un ingrediente" }, { status: 400 });
  }
  const lines: { ingredientId: string; quantity: number }[] = [];
  for (const raw of b.lines) {
    const l = (raw ?? {}) as Record<string, unknown>;
    const quantity = Number(l.quantity);
    if (typeof l.ingredientId !== "string" || !(quantity > 0)) {
      return NextResponse.json({ error: "Cada línea necesita ingrediente y cantidad mayor que 0" }, { status: 400 });
    }
    lines.push({ ingredientId: l.ingredientId, quantity });
  }

  const supplier = await prisma.supplier.findFirst({ where: { id: b.supplierId, tenantId }, select: { id: true } });
  if (!supplier) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  const ingredients = await prisma.ingredient.findMany({
    where: { tenantId, id: { in: lines.map((l) => l.ingredientId) } },
    select: { id: true, packPriceCents: true },
  });
  if (ingredients.length !== new Set(lines.map((l) => l.ingredientId)).size) {
    return NextResponse.json({ error: "Algún ingrediente no existe" }, { status: 400 });
  }
  const price = new Map(ingredients.map((i) => [i.id, i.packPriceCents]));
  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 500) : null;

  // Número correlativo por restaurante (reintento si dos pedidos chocan).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        const max = await tx.purchaseOrder.aggregate({ where: { tenantId }, _max: { number: true } });
        return tx.purchaseOrder.create({
          data: {
            tenantId,
            supplierId: supplier.id,
            number: (max._max.number ?? 0) + 1,
            notes,
            lines: { create: lines.map((l) => ({ ingredientId: l.ingredientId, quantity: l.quantity, packPriceCents: price.get(l.ingredientId)! })) },
          },
          select: { id: true, number: true },
        });
      });
      return NextResponse.json({ order }, { status: 201 });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002" || attempt === 2) {
        console.error("[POST costs/purchases]", err);
        return NextResponse.json({ error: "Error interno" }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ error: "Error interno" }, { status: 500 });
}
