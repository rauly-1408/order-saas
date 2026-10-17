import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { cancelCourier, requestCourier, toPublicCourier } from "@/app/lib/couriers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Desde la tarjeta del pedido: pedir (o reintentar) y cancelar el repartidor.
// Lo puede hacer cualquier usuario del restaurante que gestione pedidos.
async function ctx(req: NextRequest, orderId: string) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, tenantId: true, tenant: { select: { slug: true } } } });
  if (!order || order.tenant.slug !== slug) return { error: NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== order.tenantId) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  return { order };
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const c = await ctx(req, (await params).orderId);
  if ("error" in c) return c.error;
  const courier = await requestCourier(c.order.id);
  if (!courier) return NextResponse.json({ error: "Este pedido no admite repartidor externo (revisa Configuración → Repartidor externo)" }, { status: 400 });
  return NextResponse.json({ courier: toPublicCourier(courier) });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const c = await ctx(req, (await params).orderId);
  if ("error" in c) return c.error;
  return NextResponse.json({ courier: toPublicCourier(await cancelCourier(c.order.id)) });
}
