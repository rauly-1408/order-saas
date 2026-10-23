// Cancelar un pedido, lo cancele el restaurante (panel), el cliente (página de
// seguimiento) o el sistema (pago abandonado). Una sola función para que todos
// deshagan lo mismo: stock, tarjeta regalo, repartidor externo, devolución por
// la pasarela y rectificativa de VeriFactu. Ver docs/SEGUIMIENTO-Y-RESENAS.md
import { after } from "next/server";
import type { CancelReason, CancelledBy, Order } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { returnOrderStock } from "@/app/lib/inventory";
import { cancelCourier } from "@/app/lib/couriers";
import { refundOrder } from "@/app/lib/gateways";
import { restoreGiftCard } from "@/app/lib/giftCards";
import { issueInvoiceSafe } from "@/app/lib/verifactu";

// Estados desde los que el restaurante puede cancelar. En «Listos» (el cliente
// no ha venido a recoger) la comida ya está hecha: no se devuelve el stock.
export const CANCELLABLE = ["OPEN", "CREATED", "ACCEPTED", "PREPARING", "READY"] as const; // OPEN: cuenta de una mesa (Mesas)
const STOCK_RETURNABLE = ["OPEN", "CREATED", "ACCEPTED", "PREPARING"] as const;

// Margen para un pedido programado: el cliente puede cancelarlo hasta una hora
// antes de la hora elegida aunque el restaurante ya lo haya aceptado.
export const SCHEDULED_CANCEL_MARGIN_MS = 60 * 60_000;
// Tope de cancelaciones del cliente por teléfono y día (contra abusos).
export const CUSTOMER_CANCELS_PER_DAY = 2;

export const CANCEL_REASON_LABEL: Record<CancelReason, string> = {
  MISTAKE: "Me he equivocado",
  ADDRESS_TIME: "Dirección u hora incorrecta",
  CHANGED_MIND: "Ya no lo quiero",
};

// ¿Puede el cliente cancelar este pedido ahora mismo? Mientras el restaurante no
// lo haya aceptado; o, si es programado, hasta una hora antes de la hora elegida.
export function customerCanCancel(order: Pick<Order, "status" | "scheduledFor">, now = new Date()): boolean {
  if (order.status === "CREATED") return true;
  if (!order.scheduledFor) return false;
  if (!(STOCK_RETURNABLE as readonly string[]).includes(order.status)) return false; // en Listos ya no
  return order.scheduledFor.getTime() - now.getTime() >= SCHEDULED_CANCEL_MARGIN_MS;
}

export type CancelResult = { order: Order; courier: Awaited<ReturnType<typeof cancelCourier>>; refundError: string | null };

// Cancela y deshace todo. Lanza si el pedido no existe o ya no se puede cancelar.
export async function cancelOrder(orderId: string, by: CancelledBy, reason: CancelReason | null = null): Promise<CancelResult> {
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Pedido no encontrado");
    if (!(CANCELLABLE as readonly string[]).includes(order.status)) throw new Error(`Transicion invalida: ${order.status} -> CANCELLED`);
    // Cambio condicionado al estado leído: dos cancelaciones a la vez (panel y
    // cliente, o dos toques) no pueden devolver dos veces el stock ni la tarjeta regalo.
    const r = await tx.order.updateMany({ where: { id: orderId, status: order.status }, data: { status: "CANCELLED", cancelledBy: by, cancelReason: reason } });
    if (r.count === 0) throw new Error("Transicion invalida: el pedido acaba de cambiar de estado");
    if ((STOCK_RETURNABLE as readonly string[]).includes(order.status)) await returnOrderStock(tx, order.tenantId, orderId);
    await restoreGiftCard(tx, order); // el saldo vuelve a la tarjeta regalo
    return { ...order, status: "CANCELLED" as const, cancelledBy: by, cancelReason: reason };
  });
  const courier = await cancelCourier(orderId); // viaje del repartidor externo, si lo había
  const refundError = await refundOrder(orderId); // pagado online: se devuelve por la pasarela
  after(() => issueInvoiceSafe(orderId, "R5")); // facturado: rectificativa
  return { order: updated, courier, refundError };
}
