import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { readRiderToken } from "@/app/lib/riderSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const { tenant: slug } = await params;
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Comercio no encontrado" }, { status: 404 });
    const session = await readRiderToken(req);
    if (!session || session.tenantId !== tenant.id) return NextResponse.json({ error: "Inicia sesión con tu código" }, { status: 401 });
    const rider = await prisma.deliveryRider.findFirst({
      where: { id: session.riderId, tenantId: tenant.id, active: true },
      select: { id: true, name: true, accessCodeIssuedAt: true },
    });
    if (!rider || !rider.accessCodeIssuedAt || rider.accessCodeIssuedAt.getTime() !== session.codeIssuedAt) return NextResponse.json({ error: "Tu código ha cambiado o el acceso está desactivado. Vuelve a iniciar sesión." }, { status: 401 });

    const orders = await prisma.order.findMany({
      where: { tenantId: tenant.id, deliveryRiderId: rider.id, status: { in: ["READY", "DELIVERING"] } },
      select: {
        id: true, orderNumber: true, status: true, paymentStatus: true, customerName: true, customerPhone: true,
        customerAddress: true, customerPostalCode: true, notes: true, createdAt: true,
        items: { select: { id: true, productName: true, quantity: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ rider, orders });
  } catch (error) {
    console.error("[GET /api/repartidor/pedidos]", error);
    return NextResponse.json({ error: "No se pudieron cargar tus entregas" }, { status: 500 });
  }
}
