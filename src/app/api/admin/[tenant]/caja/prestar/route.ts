import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { accessOf, cajaPrestada, puestoLabel } from "@/app/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prestar la caja a un camarero (o el cierre del día a alguien de Caja).
// Solo el encargado o el gerente. Así, si el encargado falta, el camarero abre
// y cierra turnos con su propio usuario y queda apuntado quién lo hizo.
// Caduca sola al cerrar el día (Z) o a las 14 horas. Ver docs/CAJA.md
//   GET  → el personal al que se le puede prestar y si la tiene
//   POST { userId, on: boolean, closeDay?: boolean }

const HOURS = 14;

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  if (!accessOf(session).anular) return { error: NextResponse.json({ error: "Solo el encargado o el gerente pueden dejar la caja a otra persona" }, { status: 403 }) };
  return { tenant, session };
}

// Personal que no tiene el cierre del día por su puesto: camareros y Caja.
async function staff(tenantId: string) {
  const users = await prisma.user.findMany({
    where: { tenantId, active: true, role: "STORE_MANAGER", OR: [{ position: { in: ["CAMARERO", "CAJA"] } }, { position: null }] },
    select: { id: true, name: true, email: true, role: true, position: true, cajaUntil: true, cajaCloseDay: true, cajaGrantedBy: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => {
    const on = cajaPrestada(u);
    return { id: u.id, name: u.name || u.email.split("@")[0], puesto: puestoLabel(u), isCaja: u.position !== "CAMARERO", on, until: on ? u.cajaUntil : null, closeDay: on && u.cajaCloseDay, grantedBy: on ? u.cajaGrantedBy : null };
  });
}

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    return NextResponse.json({ staff: await staff(c.tenant.id) });
  } catch (err) {
    console.error("[GET /api/admin/caja/prestar]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const b = (await req.json().catch(() => ({}))) as { userId?: unknown; on?: unknown; closeDay?: unknown };
    const userId = typeof b.userId === "string" ? b.userId : "";
    const target = (await staff(c.tenant.id)).find((u) => u.id === userId);
    if (!target) return NextResponse.json({ error: "Esa persona no existe o no se le puede dejar la caja" }, { status: 404 });
    const me = await prisma.user.findUnique({ where: { id: c.session.userId }, select: { name: true, email: true } });
    const on = b.on === true;
    // A quien es de Caja solo se le presta el cierre del día (la caja ya es suya).
    const closeDay = on && (target.isCaja || b.closeDay === true);
    await prisma.user.update({
      where: { id: userId },
      data: on
        ? { cajaUntil: new Date(Date.now() + HOURS * 3600_000), cajaCloseDay: closeDay, cajaGrantedBy: me?.name || me?.email || null }
        : { cajaUntil: null, cajaCloseDay: false, cajaGrantedBy: null },
    });
    return NextResponse.json({ staff: await staff(c.tenant.id) });
  } catch (err) {
    console.error("[POST /api/admin/caja/prestar]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
