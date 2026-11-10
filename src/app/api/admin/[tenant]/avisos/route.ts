import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { accessOf } from "@/app/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/avisos → los números del menú lateral:
//   pedidos: nuevos sin aceptar (online o por teléfono) de las últimas 24 h
//   reservas: por confirmar y en lista de espera, de ahora en adelante
// Cada uno solo si el puesto ve esa parte. Ver docs/USABILIDAD.md
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").at(-2) ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  const access = accessOf(session);
  const byStore = session.storeId ? { storeId: session.storeId } : {};
  const now = Date.now();
  const [pedidos, reservas] = await Promise.all([
    access.pedidos && !access.station
      ? prisma.order.count({ where: { tenantId: tenant.id, ...byStore, tableId: null, status: "CREATED", createdAt: { gte: new Date(now - 24 * 3_600_000) } } })
      : Promise.resolve(0),
    access.mesas
      ? prisma.reservation.count({ where: { tenantId: tenant.id, ...byStore, status: { in: ["PENDING", "WAITLIST"] }, startsAt: { gte: new Date(now - 2 * 3_600_000) } } })
      : Promise.resolve(0),
  ]);
  return NextResponse.json({ pedidos, reservas }, { headers: { "Cache-Control": "no-store" } });
}
