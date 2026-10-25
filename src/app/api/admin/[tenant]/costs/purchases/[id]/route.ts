import { NextRequest, NextResponse } from "next/server";
import { recalcPreps } from "@/app/lib/preps";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, lastSegment } from "@/app/lib/costsApi";
import { applyStockDeltas } from "@/app/lib/inventory";
import { nextDeliveryOffset, recordPriceChange } from "@/app/lib/purchasing";
import { startOfTodayIn, tenantTimeZone, wallClockIn } from "@/app/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH: { action: "send" | "cancel" | "receive", lines?: [{ id, receivedQuantity, packPriceCents? }] }
// Recibir mete en stock lo que llegó (RECEIPT) y, si cambió el precio, actualiza
// el ingrediente y lo registra en el historial de precios.
export async function PATCH(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const order = await prisma.purchaseOrder.findFirst({
    where: { id: lastSegment(req), tenantId },
    include: { lines: { include: { ingredient: { select: { id: true, packSize: true, packPriceCents: true } } } } },
  });
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = b.action;
  const closed = order.status === "RECEIVED" || order.status === "CANCELLED";

  if (action === "send") {
    if (closed) return NextResponse.json({ error: "El pedido ya está cerrado" }, { status: 409 });
    // Entrega prevista según el reparto del proveedor, en la hora del restaurante.
    const [supplier, tenant] = await Promise.all([
      prisma.supplier.findUnique({ where: { id: order.supplierId }, select: { deliveryDays: true, leadDays: true, orderCutoff: true } }),
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    ]);
    const now = new Date();
    const tz = tenantTimeZone(tenant?.settings);
    const clock = wallClockIn(tz, now);
    const offset = supplier ? nextDeliveryOffset(clock.isoWeekday, clock.minutes, supplier) : null;
    // Mediodía del día de entrega: evita saltos de fecha por el cambio de hora.
    const expectedAt = offset == null ? null : new Date(startOfTodayIn(tz, now).getTime() + offset * 86_400_000 + 12 * 3_600_000);
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "SENT", sentAt: now, expectedAt } });
    return NextResponse.json({ ok: true });
  }

  if (action === "cancel") {
    if (closed) return NextResponse.json({ error: "El pedido ya está cerrado" }, { status: 409 });
    await prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true });
  }

  if (action === "receive") {
    if (closed) return NextResponse.json({ error: "El pedido ya está cerrado" }, { status: 409 });
    const input = new Map<string, { received: number; price?: number }>();
    for (const raw of Array.isArray(b.lines) ? b.lines : []) {
      const l = (raw ?? {}) as Record<string, unknown>;
      const received = Number(l.receivedQuantity);
      const price = l.packPriceCents === undefined ? undefined : Number(l.packPriceCents);
      if (typeof l.id !== "string" || !(received >= 0) || (price !== undefined && !(Number.isInteger(price) && price >= 0))) {
        return NextResponse.json({ error: "Cantidad o precio no válido" }, { status: 400 });
      }
      input.set(l.id, { received, price });
    }

    await prisma.$transaction(async (tx) => {
      const deltas = new Map<string, number>();
      for (const line of order.lines) {
        const given = input.get(line.id);
        const received = given?.received ?? line.quantity; // si no se indica, llegó lo pedido
        await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { receivedQuantity: received } });
        if (received > 0) deltas.set(line.ingredientId, (deltas.get(line.ingredientId) ?? 0) + received);

        const newPrice = given?.price;
        if (newPrice !== undefined && newPrice !== line.ingredient.packPriceCents) {
          await tx.ingredient.update({ where: { id: line.ingredientId }, data: { packPriceCents: newPrice } });
          await recordPriceChange(tx, tenantId, line.ingredientId, line.ingredient, { packSize: line.ingredient.packSize, packPriceCents: newPrice }, "RECEIPT");
        }
      }
      // Entrada de stock (activa el control si el ingrediente no lo tenía).
      if (deltas.size) {
        await tx.ingredient.updateMany({ where: { id: { in: [...deltas.keys()] }, tenantId }, data: { trackStock: true } });
        await applyStockDeltas(tx, tenantId, deltas, "RECEIPT", { note: `Pedido a proveedor nº ${order.number}` });
      }
      await tx.purchaseOrder.update({ where: { id: order.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
      await recalcPreps(tx, tenantId); // por si cambió algún precio
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
