import { NextRequest, NextResponse } from "next/server";
import type { OrderStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { returnOrderStock } from "@/app/lib/inventory";
import { getSessionFromRequest } from "@/app/lib/auth";
import { cancelCourier, courierAccount, requestCourier, toPublicCourier } from "@/app/lib/couriers";
import { refundOrder } from "@/app/lib/gateways";
import { restoreGiftCard } from "@/app/lib/giftCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Flujo del panel: Aceptar lleva directo a PREPARING (ACCEPTED se mantiene solo
// por compatibilidad con pedidos antiguos). DELIVERING solo aplica a delivery.
const VALID_TRANSITIONS: Record<string, string[]> = {
      CREATED:    ["PREPARING", "ACCEPTED", "CANCELLED"],
      ACCEPTED:   ["PREPARING", "CANCELLED"],
      PREPARING:  ["READY", "CANCELLED"],
      READY:      ["DELIVERING", "DELIVERED"],
      DELIVERING: ["DELIVERED"],
      DELIVERED:  [],
      CANCELLED:  [],
};

export async function PATCH(req: NextRequest) {
      try {
              const url = new URL(req.url);
              const segments = url.pathname.split("/");
              // pathname: /api/orders/status/[orderId]
        const orderId = segments[segments.length - 1];

        // paidWith: cómo ha pagado el cliente un pedido «al recoger / al entregar».
        // Va con status DELIVERED (se cobra al entregar) o solo, para apuntar el
        // cobro de un pedido ya entregado que se quedó sin registrar.
        const body = (await req.json().catch(() => ({}))) as { status?: unknown; paidWith?: unknown };
        const newStatus = body.status;
        const paidWith = (["CASH", "CARD_TERMINAL", "BIZUM"] as const).find((m) => m === body.paidWith) ?? null;
        if (typeof newStatus !== "string" && !paidWith) {
          return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
        }

        const order = await prisma.order.findUnique({ where: { id: orderId } });
              if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

        // Solo el dueño autenticado del tenant del pedido (o SUPERADMIN) puede cambiar su estado.
        const session = await getSessionFromRequest(req);
        if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        if (session.role !== "SUPERADMIN" && session.tenantId !== order.tenantId) {
          return NextResponse.json({ error: "Prohibido" }, { status: 403 });
        }
        // Empleado limitado a un local: solo los pedidos de ese local.
        if (session.storeId && session.storeId !== order.storeId) {
          return NextResponse.json({ error: "Este pedido es de otro local" }, { status: 403 });
        }

        // Solo apuntar el cobro (sin cambiar de estado).
        if (typeof newStatus !== "string") {
          if (order.status === "CANCELLED") return NextResponse.json({ error: "El pedido está cancelado" }, { status: 400 });
          if (order.paymentStatus === "PAID") return NextResponse.json({ error: "El pedido ya está cobrado" }, { status: 400 });
          const u = await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID", paymentMethod: paidWith as PaymentMethod, paidAt: new Date() } });
          return NextResponse.json({ orderId: u.id, status: u.status, courier: null, refundError: null });
        }

        const allowed = VALID_TRANSITIONS[order.status] ?? [];
              const deliveringOnPickup = newStatus === "DELIVERING" && order.channel !== "DELIVERY";
              if (!allowed.includes(newStatus) || deliveringOnPickup) {
                        return NextResponse.json(
                            { error: `Transicion invalida: ${order.status} -> ${newStatus}` },
                            { status: 400 }
                                  );
              }

        // Al cancelar se devuelve al stock lo que consumió el pedido (si lo hubo).
        const updated = await prisma.$transaction(async (tx) => {
          // Al entregar un pedido pendiente de cobro se apunta cómo ha pagado.
          const collect = newStatus === "DELIVERED" && paidWith && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED";
          const u = await tx.order.update({
            where: { id: orderId },
            data: { status: newStatus as OrderStatus, ...(collect && { paymentStatus: "PAID", paymentMethod: paidWith as PaymentMethod, paidAt: new Date() }) }, // validado contra VALID_TRANSITIONS
          });
          if (newStatus === "CANCELLED") {
            await returnOrderStock(tx, order.tenantId, orderId);
            await restoreGiftCard(tx, order); // el saldo vuelve a la tarjeta regalo
          }
          return u;
        });

        // Repartidor externo: se pide al aceptar un pedido a domicilio (si está
        // activado) y se cancela si se cancela el pedido.
        let courier = null;
        if (order.channel === "DELIVERY" && (newStatus === "PREPARING" || newStatus === "ACCEPTED")) {
          const account = await courierAccount(order.tenantId);
          if (account?.impl && account.row.autoRequest) courier = await requestCourier(order.id);
        } else if (newStatus === "CANCELLED") {
          courier = await cancelCourier(order.id);
        }

        // Pedido pagado online y cancelado: se devuelve el dinero por la pasarela.
        const refundError = newStatus === "CANCELLED" ? await refundOrder(order.id) : null;

        return NextResponse.json({ orderId: updated.id, status: updated.status, courier: toPublicCourier(courier), refundError });
      } catch (err) {
              console.error("[PATCH /api/orders/status]", err);
              return NextResponse.json({ error: "Error interno" }, { status: 500 });
      }
}
