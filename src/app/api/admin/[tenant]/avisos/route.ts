import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { accessOf } from "@/app/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/avisos → los números del menú lateral:
//   pedidos: nuevos sin aceptar (online o por teléfono) de las últimas 24 h
//   reservas: por confirmar, en lista de espera y las de la web aún sin ver, de ahora en adelante
//   nuevaReserva: la última de la web sin ver (para el aviso con sonido)
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
  const upcoming = { gte: new Date(now - 2 * 3_600_000) };
  const resWhere = { tenantId: tenant.id, ...byStore, startsAt: upcoming, OR: [{ status: { in: ["PENDING" as const, "WAITLIST" as const] } }, { source: "ONLINE" as const, seenAt: null, status: "CONFIRMED" as const }] };
  const [pedidos, reservas, nueva] = await Promise.all([
    access.pedidos && !access.station
      ? prisma.order.count({ where: { tenantId: tenant.id, ...byStore, tableId: null, status: "CREATED", createdAt: { gte: new Date(now - 24 * 3_600_000) } } })
      : Promise.resolve(0),
    access.mesas ? prisma.reservation.count({ where: resWhere }) : Promise.resolve(0),
    access.mesas
      ? prisma.reservation.findFirst({ where: { tenantId: tenant.id, ...byStore, source: "ONLINE", seenAt: null, startsAt: upcoming, status: { in: ["PENDING", "CONFIRMED", "WAITLIST"] } }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, guests: true, startsAt: true, status: true } })
      : Promise.resolve(null),
  ]);
  return NextResponse.json({ pedidos, reservas, nuevaReserva: nueva }, { headers: { "Cache-Control": "no-store" } });
}
