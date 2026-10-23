import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { parseOnline } from "@/app/lib/brand";
import { customerCourier, syncCourier } from "@/app/lib/couriers";
import { customerProven } from "@/app/lib/customerProof";
import { customerCanCancel } from "@/app/lib/cancelOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/track/[orderId] → estado del pedido para la página de seguimiento.
// Público (el id es largo e imposible de adivinar) y sin datos personales.
export async function GET(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      tenantId: true,
      customerPhone: true,
      status: true,
      channel: true,
      scheduledFor: true,
      cancelledBy: true,
      estimatedReadyAt: true,
      updatedAt: true,
      courier: true,
      review: { select: { rating: true, comment: true } },
      tenant: { select: { branding: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  // Repartidor externo: se pone al día (como mucho una consulta por minuto a Glovo).
  const courier = order.courier ? await syncCourier(order.courier, order) : null;
  // Si el repartidor lo ha recogido o entregado, el pedido acaba de cambiar.
  const status =
    courier && courier.status !== order.courier?.status
      ? ((await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } }))?.status ?? order.status)
      : order.status;
  const online = parseOnline((order.tenant.branding as Record<string, unknown> | null)?.online);
  // Cancelar: solo desde el dispositivo que hizo el pedido y mientras se pueda.
  const canCancel = customerProven(req, order.tenantId, order.customerPhone) && customerCanCancel({ status, scheduledFor: order.scheduledFor });
  return NextResponse.json(
    { status, channel: order.channel, estimatedReadyAt: order.estimatedReadyAt, review: order.review, googleReviewUrl: online.reviewsUrl, courier: customerCourier(courier), canCancel, cancelledBy: order.cancelledBy },
    { headers: { "Cache-Control": "no-store" } }
  );
}
