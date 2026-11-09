import { NextRequest, NextResponse, after } from "next/server";
import type { ReservationStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { reservationsAuth } from "@/app/lib/reservationsApi";
import { ACTIVE, notifyReservation, notifyWaitlist, optionsFor, reservationContext } from "@/app/lib/reservationsDb";
import { guestsAt } from "@/app/lib/reservations";
import { TableError, openTable, setTableLabel } from "@/app/lib/tables";

export const runtime = "nodejs";

// GET            → opciones de mesa para esta reserva (la primera, la sugerida)
// PATCH { status } → confirmar, llegó, no vino, cancelar o deshacer. «Llegó»
//                  abre su mesa con el nombre del cliente si está libre.
// PATCH { tableIds } → asignar mesa o combinación ([] = sin mesa).
// Al confirmar una pendiente o cancelar, se avisa al cliente por email.
const NEXT: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SEATED", "NO_SHOW", "CANCELLED"],
  SEATED: ["CONFIRMED"], // deshacer «Llegó»
  NO_SHOW: ["CONFIRMED"], // deshacer «No vino»
  CANCELLED: ["CONFIRMED"], // recuperar
  WAITLIST: ["CONFIRMED", "CANCELLED"], // lista de espera: dar mesa o quitar
};

async function find(req: NextRequest, params: Promise<{ tenant: string; id: string }>) {
  const { tenant, id } = await params;
  const a = await reservationsAuth(req, tenant);
  if ("error" in a) return { error: a.error! };
  const r = await prisma.reservation.findFirst({ where: { id, tenantId: a.tenant.id } });
  if (!r || (a.session.storeId && a.session.storeId !== r.storeId)) return { error: NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 }) };
  return { ...a, r };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const f = await find(req, params);
  if ("error" in f) return f.error;
  return NextResponse.json({ options: await optionsFor(f.r.storeId, f.r.startsAt, f.r.durationMinutes, f.r.guests, f.r.id) });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  try {
    const f = await find(req, params);
    if ("error" in f) return f.error;
    const { r, tenant, session } = f;
    const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;

    if (Array.isArray(b.tableIds)) {
      const ids = [...new Set(b.tableIds.filter((x): x is string => typeof x === "string"))].slice(0, 8);
      const n = await prisma.diningTable.count({ where: { id: { in: ids }, storeId: r.storeId, isActive: true } });
      if (n !== ids.length) return NextResponse.json({ error: "Esa mesa no es de este local" }, { status: 400 });
      await prisma.reservation.update({ where: { id: r.id }, data: { tableIds: ids } });
      return NextResponse.json({ ok: true });
    }

    const to = b.status as ReservationStatus;
    if (!NEXT[r.status]?.includes(to)) return NextResponse.json({ error: "Ese cambio no se puede hacer" }, { status: 400 });

    // Dar mesa a la lista de espera: comprobar el sitio (se puede forzar) y buscarle mesa.
    let tableIds: string[] | undefined;
    if (r.status === "WAITLIST" && to === "CONFIRMED") {
      const ctx = await reservationContext(tenant, r.storeId);
      const others = await prisma.reservation.findMany({ where: { storeId: r.storeId, status: { in: ACTIVE }, startsAt: { gte: new Date(r.startsAt.getTime() - 6 * 3_600_000), lt: new Date(r.startsAt.getTime() + r.durationMinutes * 60_000) } }, select: { startsAt: true, durationMinutes: true, guests: true } });
      const free = ctx.capacity - guestsAt(others, r.startsAt, r.durationMinutes);
      if (free < r.guests && b.force !== true) return NextResponse.json({ error: `A esa hora solo quedan ${Math.max(0, free)} plazas`, full: true }, { status: 409 });
      tableIds = (await optionsFor(r.storeId, r.startsAt, r.durationMinutes, r.guests, r.id)).find((o) => o.fits)?.tableIds ?? [];
    }
    await prisma.reservation.update({
      where: { id: r.id },
      data: { status: to, ...(tableIds && { tableIds }), ...(to === "CANCELLED" ? { cancelledAt: new Date(), cancelledBy: "RESTAURANT" } : { cancelledAt: null, cancelledBy: null }) },
    });
    if ((r.status === "PENDING" || r.status === "WAITLIST") && to === "CONFIRMED") after(() => notifyReservation(r.id, "confirmed"));
    if (to === "CANCELLED" && r.status !== "WAITLIST") after(() => notifyReservation(r.id, "cancelled"));
    // Se libera sitio: avisar a la lista de espera de ese día.
    if ((to === "CANCELLED" || to === "NO_SHOW") && ACTIVE.includes(r.status)) {
      const t = await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { id: true, slug: true, name: true, settings: true } });
      if (t) after(() => notifyWaitlist(t, r.storeId, r.startsAt));
    }

    // «Llegó»: abrir su mesa (la primera si es una combinación) con su nombre.
    let opened: { orderId: string; table: string } | null = null;
    let notice: string | null = null;
    if (to === "SEATED" && r.tableIds[0]) {
      try {
        const currency = ((tenant.settings as Record<string, unknown>)?.currency as string) ?? "EUR";
        const order = await openTable(tenant.id, r.tableIds[0], r.guests, session.userId, currency);
        await setTableLabel(tenant.id, order.id, r.name);
        const t = await prisma.diningTable.findUnique({ where: { id: r.tableIds[0] }, select: { name: true } });
        opened = { orderId: order.id, table: t?.name ?? "" };
      } catch (err) {
        if (!(err instanceof TableError)) throw err;
        notice = `${err.message}: ábrela a mano en Mesas`;
      }
    }
    return NextResponse.json({ ok: true, opened, notice });
  } catch (err) {
    console.error("[PATCH /api/admin/reservas/[id]]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
