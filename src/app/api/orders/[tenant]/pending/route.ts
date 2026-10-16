import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/orders/[tenant]/pending → pedidos nuevos sin aceptar (para el aviso
// sonoro del panel). Ligera: solo lo necesario para sonar y mostrar el aviso.
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
    where: { tenantId: tenant.id, status: "CREATED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, orderNumber: true, customerName: true, totalCents: true, channel: true },
  });
  return NextResponse.json({ pending });
}
