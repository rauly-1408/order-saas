import { NextRequest, NextResponse, after } from "next/server";
import type { OrderStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { courierAccount, requestCourier, toPublicCourier } from "@/app/lib/couriers";
import { cancelOrder } from "@/app/lib/cancelOrder";
import { issueInvoiceSafe } from "@/app/lib/verifactu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Flujo del panel: Aceptar lleva directo a PREPARING (ACCEPTED se mantiene solo
// por compatibilidad con pedidos antiguos). DELIVERING solo aplica a delivery.
const VALID_TRANSITIONS: Record<string, string[]> = {
      CREATED:    ["PREPARING", "ACCEPTED", "CANCELLED"],
      ACCEPTED:   ["PREPARING", "CANCELLED"],
      PREPARING:  ["READY", "CANCELLED"],
      READY:      ["DELIVERING", "DELIVERED", "CANCELLED"], // cancelar en Listos: el cliente no ha venido a recoger
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

        // Una mesa abierta se cobra, se mueve o se cierra desde Mesas.
        if (order.status === "OPEN") return NextResponse.json({ error: "Esta cuenta es de una mesa: se gestiona desde Mesas" }, { status: 400 });

        // Solo apuntar el cobro (sin cambiar de estado).
        if (typeof newStatus !== "string") {
          if (order.status === "CANCELLED") return NextResponse.json({ error: "El pedido está cancelado" }, { status: 400 });
          // Un pago online sin confirmar no se puede apuntar como cobrado en persona.
          if (order.status === "AWAITING_PAYMENT") return NextResponse.json({ error: "Este pedido está pendiente de pago online" }, { status: 400 });
          if (order.paymentStatus === "PAID") return NextResponse.json({ error: "El pedido ya está cobrado" }, { status: 400 });
          const u = await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID", paymentMethod: paidWith as PaymentMethod, paidAt: new Date() } });
          after(() => issueInvoiceSafe(u.id));
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

        // Cancelar: una sola función deshace stock, tarjeta regalo, repartidor,
        // devolución por la pasarela y rectificativa (la misma que usa el cliente).
        if (newStatus === "CANCELLED") {
          const r = await cancelOrder(orderId, "RESTAURANT");
          return NextResponse.json({ orderId: r.order.id, status: r.order.status, courier: toPublicCourier(r.courier), refundError: r.refundError });
        }

        // Al entregar un pedido pendiente de cobro se apunta cómo ha pagado.
        const collect = newStatus === "DELIVERED" && paidWith && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED";
        const updated = await prisma.order.update({
          where: { id: orderId },
          data: { status: newStatus as OrderStatus, ...(collect && { paymentStatus: "PAID", paymentMethod: paidWith as PaymentMethod, paidAt: new Date() }) }, // validado contra VALID_TRANSITIONS
        });

        // Repartidor externo: se pide al aceptar un pedido a domicilio (si está activado).
        let courier = null;
        if (order.channel === "DELIVERY" && (newStatus === "PREPARING" || newStatus === "ACCEPTED")) {
          const account = await courierAccount(order.tenantId);
          if (account?.impl && account.row.autoRequest) courier = await requestCourier(order.id);
        }

        // VeriFactu: cobrado al entregar → factura.
        if (newStatus === "DELIVERED" && paidWith) after(() => issueInvoiceSafe(order.id));
        const refundError = null;

        return NextResponse.json({ orderId: updated.id, status: updated.status, courier: toPublicCourier(courier), refundError });
      } catch (err) {
              console.error("[PATCH /api/orders/status]", err);
              return NextResponse.json({ error: "Error interno" }, { status: 500 });
      }
}
