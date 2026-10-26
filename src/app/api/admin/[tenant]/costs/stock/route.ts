import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { applyStockDeltas } from "@/app/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["RECEIPT", "COUNT", "WASTE", "USE"] as const;
type ManualType = (typeof TYPES)[number];

// POST: movimiento manual de stock.
//   RECEIPT → entra mercancía (+cantidad)
//   WASTE   → merma declarada (−cantidad)
//   USE     → consumible gastado («He gastado» una garrafa, un paquete…) (−cantidad)
//   COUNT   → recuento físico: la cantidad es lo contado; se registra la diferencia
// Una entrada o un recuento activan el control de stock del ingrediente.
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const type = b.type as ManualType;
  const quantity = Number(b.quantity);
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 200) : undefined;
  if (typeof b.ingredientId !== "string" || !TYPES.includes(type)) {
    return NextResponse.json({ error: "Movimiento no válido" }, { status: 400 });
  }
  if (!(Number.isFinite(quantity) && (type === "COUNT" ? quantity >= 0 : quantity > 0))) {
    return NextResponse.json({ error: "Cantidad no válida" }, { status: 400 });
  }

  const ingredient = await prisma.ingredient.findFirst({
    where: { id: b.ingredientId, tenantId },
    select: { id: true, stockQty: true, trackStock: true },
  });
  if (!ingredient) return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (!ingredient.trackStock && type !== "WASTE" && type !== "USE") {
      await tx.ingredient.update({ where: { id: ingredient.id }, data: { trackStock: true } });
    }
    // Leer el stock dentro de la transacción para que el recuento no pise un pedido simultáneo.
    const current = (await tx.ingredient.findUniqueOrThrow({ where: { id: ingredient.id }, select: { stockQty: true } })).stockQty;
    const delta = type === "RECEIPT" ? quantity : type === "WASTE" || type === "USE" ? -quantity : quantity - current;
    if (delta !== 0) {
      await applyStockDeltas(tx, tenantId, new Map([[ingredient.id, delta]]), type, { note });
    } else if (type === "COUNT") {
      // Recuento que cuadra: se registra igualmente para el historial.
      await tx.stockMovement.create({ data: { tenantId, ingredientId: ingredient.id, type, quantity: 0, stockAfter: current, valueCents: 0, note: note ?? null } });
    }
  });
  return NextResponse.json({ ok: true });
}
