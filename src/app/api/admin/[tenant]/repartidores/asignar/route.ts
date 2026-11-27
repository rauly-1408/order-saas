import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { orderId, riderId } — riderId null removes the assignment.
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params;
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as { orderId?: unknown; riderId?: unknown };
    if (typeof body.orderId !== "string" || !(typeof body.riderId === "string" || body.riderId === null)) {
      return NextResponse.json({ error: "Datos de asignación no válidos" }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { id: body.orderId, tenantId: tenant.id },
      select: { id: true, channel: true, status: true, courier: { select: { id: true } } },
    });
    if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    if (order.channel !== "DELIVERY") return NextResponse.json({ error: "Solo se pueden asignar pedidos a domicilio" }, { status: 400 });
    if (order.courier) return NextResponse.json({ error: "Este pedido ya tiene un repartidor externo asignado" }, { status: 409 });
    if (["DELIVERED", "CANCELLED", "OPEN"].includes(order.status)) {
      return NextResponse.json({ error: "Este pedido ya no admite cambios de repartidor" }, { status: 409 });
    }

    if (body.riderId !== null) {
      const rider = await prisma.deliveryRider.findFirst({
        where: { id: body.riderId, tenantId: tenant.id, active: true },
        select: { id: true },
      });
      if (!rider) return NextResponse.json({ error: "El repartidor no existe o está inactivo" }, { status: 404 });
    }

    const updated = await prisma.order.updateMany({
      where: { id: order.id, tenantId: tenant.id },
      data: { deliveryRiderId: body.riderId },
    });
    if (!updated.count) return NextResponse.json({ error: "No se pudo actualizar el pedido" }, { status: 409 });
    return NextResponse.json({ ok: true, riderId: body.riderId });
  } catch (error) {
    console.error("[POST /api/admin/repartidores/asignar]", error);
    return NextResponse.json({ error: "No se pudo asignar el repartidor" }, { status: 500 });
  }
}
