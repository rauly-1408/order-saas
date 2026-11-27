import { after, NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { readRiderToken } from "@/app/lib/riderSession";
import { issueInvoiceSafe } from "@/app/lib/verifactu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El repartidor puede iniciar su reparto al recogerlo y confirmar la entrega.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenant: string; orderId: string }> }) {
  try {
    const { tenant: slug, orderId } = await params;
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });
    const session = await readRiderToken(req);
    if (!session || session.tenantId !== tenant.id) return NextResponse.json({ error: "Inicia sesión con tu código" }, { status: 401 });
    const rider = await prisma.deliveryRider.findFirst({ where: { id: session.riderId, tenantId: tenant.id, active: true }, select: { id: true, accessCodeIssuedAt: true } });
    if (!rider || !rider.accessCodeIssuedAt || rider.accessCodeIssuedAt.getTime() !== session.codeIssuedAt) return NextResponse.json({ error: "Tu código ha cambiado o el acceso está desactivado. Vuelve a iniciar sesión." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { status?: unknown; paidWith?: unknown };
    if (body.status !== "DELIVERING" && body.status !== "DELIVERED") return NextResponse.json({ error: "Transición no permitida" }, { status: 400 });
    const paidWith = (["CASH", "CARD_TERMINAL", "BIZUM"] as const).find((method) => method === body.paidWith) ?? null;
    if (body.paidWith !== undefined && !paidWith) return NextResponse.json({ error: "Forma de cobro no válida" }, { status: 400 });

    const expectedStatus = body.status === "DELIVERING" ? "READY" : "DELIVERING";
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId: tenant.id, deliveryRiderId: rider.id, status: expectedStatus, channel: "DELIVERY" },
      select: { id: true, paymentStatus: true },
    });
    if (!order) return NextResponse.json({ error: "El pedido ya cambió o no está asignado a tu cuenta" }, { status: 409 });

    const collect = body.status === "DELIVERED" && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED";
    if (collect && !paidWith) return NextResponse.json({ error: "Indica cómo has cobrado el pedido para registrar la entrega" }, { status: 400 });
    const updated = await prisma.order.updateMany({
      where: { id: order.id, tenantId: tenant.id, deliveryRiderId: rider.id, status: expectedStatus, channel: "DELIVERY", paymentStatus: order.paymentStatus },
      data: {
        status: body.status,
        ...(collect && paidWith ? { paymentStatus: "PAID", paymentMethod: paidWith as PaymentMethod, paidAt: new Date() } : {}),
      },
    });
    if (!updated.count) return NextResponse.json({ error: "El pedido cambió mientras se registraba la entrega. Actualiza la lista e inténtalo de nuevo." }, { status: 409 });
    if (collect) after(() => issueInvoiceSafe(order.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/repartidor/pedidos]", error);
    return NextResponse.json({ error: "No se pudo actualizar la entrega" }, { status: 500 });
  }
}
