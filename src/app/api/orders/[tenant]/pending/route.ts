import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/orders/[tenant]/pending → pedidos nuevos sin aceptar (para el aviso
// sonoro del panel) y pedidos que el cliente ha cancelado en los últimos minutos
// (aviso distinto, para que cocina no lo prepare), y los ingredientes que han
// bajado de su mínimo (aviso de stock). Ligera: solo lo necesario.
export async function GET(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.length - 2];
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }
  const pending = await prisma.order.findMany({
    // El empleado limitado a un local solo oye los pedidos de ese local.
    where: { tenantId: tenant.id, status: "CREATED", ...(session.storeId && { storeId: session.storeId }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, orderNumber: true, customerName: true, totalCents: true, channel: true },
  });
  const cancelled = await prisma.order.findMany({
    where: { tenantId: tenant.id, status: "CANCELLED", cancelledBy: "CUSTOMER", updatedAt: { gte: new Date(Date.now() - 10 * 60_000) }, ...(session.storeId && { storeId: session.storeId }) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, orderNumber: true, customerName: true, totalCents: true, channel: true, cancelReason: true },
  });
  const lowStock = await prisma.ingredient.findMany({
    where: { tenantId: tenant.id, isActive: true, trackStock: true, minStock: { not: null }, stockQty: { lte: prisma.ingredient.fields.minStock } },
    orderBy: { name: "asc" },
    take: 50,
    select: { id: true, name: true, stockQty: true, minStock: true, baseUnit: true },
  });
  return NextResponse.json({ pending, cancelled, lowStock });
}
