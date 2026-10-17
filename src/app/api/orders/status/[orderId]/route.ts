import { NextRequest, NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { returnOrderStock } from "@/app/lib/inventory";
import { getSessionFromRequest } from "@/app/lib/auth";
import { cancelCourier, courierAccount, requestCourier, toPublicCourier } from "@/app/lib/couriers";
import { refundOrder } from "@/app/lib/gateways";

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

        const { status: newStatus } = (await req.json()) as { status?: unknown };
        if (typeof newStatus !== "string") {
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
          const u = await tx.order.update({
            where: { id: orderId },
            data: { status: newStatus as OrderStatus }, // validado contra VALID_TRANSITIONS
          });
          if (newStatus === "CANCELLED") await returnOrderStock(tx, order.tenantId, orderId);
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
