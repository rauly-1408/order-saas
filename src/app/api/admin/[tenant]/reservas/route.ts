import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { listStores, storeForSession } from "@/app/lib/stores";
import { cleanText } from "@/app/lib/text";
import { addDays, localParts, startOfDayIn } from "@/app/lib/time";
import { isValidEmail, isValidSpanishPhone } from "@/app/lib/reservations";
import { reservationsAuth } from "@/app/lib/reservationsApi";
import { ReservationError, createReservation, isDuplicateCode, notifyReservation, reservationContext, slotsFor } from "@/app/lib/reservationsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  ?fecha=YYYY-MM-DD&local=…              → reservas del día, aforo y ajustes
// GET  ?fecha=…&personas=n&horas=1            → horas para apuntar una reserva
// POST { at, guests, name, phone, email?, notes?, source, force? } → nueva reserva
// Quien tenga acceso a Mesas. Ver docs/RESERVAS.md
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const a = await reservationsAuth(req, (await params).tenant);
    if ("error" in a) return a.error;
    const q = new URL(req.url).searchParams;
    const storeId = await storeForSession(a.tenant.id, a.session.storeId, q.get("local"));
    if (!storeId) return NextResponse.json({ error: "No hay ningún local activo" }, { status: 400 });
    const ctx = await reservationContext(a.tenant, storeId);
    const ymd = /^\d{4}-\d{2}-\d{2}$/.test(q.get("fecha") ?? "") ? q.get("fecha")! : localParts(new Date(), ctx.tz).ymd;
    if (q.get("horas")) {
      const guests = Math.max(1, Math.min(200, Math.floor(Number(q.get("personas")) || 2)));
      // El restaurante elige cualquier minuto, de la apertura al cierre (reloj tipo despertador).
      return NextResponse.json({ slots: await slotsFor({ ...ctx, settings: { ...ctx.settings, stepMinutes: 1 } }, ymd, guests, { ignoreNotice: true }) });
    }
    const [list, stores] = await Promise.all([
      prisma.reservation.findMany({
        where: { storeId, startsAt: { gte: startOfDayIn(ctx.tz, ymd), lt: startOfDayIn(ctx.tz, addDays(ymd, 1)) } },
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
        select: { id: true, startsAt: true, durationMinutes: true, guests: true, name: true, phone: true, email: true, notes: true, status: true, source: true, code: true, createdAt: true, tableIds: true, customerConfirmedAt: true, reminderSentAt: true },
      }),
      a.session.storeId ? Promise.resolve([]) : listStores(a.tenant.id, { activeOnly: true }),
    ]);
    const tables = await prisma.diningTable.findMany({ where: { storeId }, select: { id: true, name: true } });
    // Tira de días (de ayer a dentro de 13 días): reservas, comensales y por confirmar de cada día.
    const today = localParts(new Date(), ctx.tz).ymd;
    const stripFrom = addDays(today, -1);
    const strip = await prisma.reservation.findMany({
      where: { storeId, status: { in: ["PENDING", "CONFIRMED", "SEATED"] }, startsAt: { gte: startOfDayIn(ctx.tz, stripFrom), lt: startOfDayIn(ctx.tz, addDays(today, 14)) } },
      select: { startsAt: true, guests: true, status: true },
    });
    const days: Record<string, { count: number; guests: number; pending: number }> = {};
    for (let i = 0; i < 15; i++) days[addDays(stripFrom, i)] = { count: 0, guests: 0, pending: 0 };
    for (const r of strip) {
      const d = days[localParts(r.startsAt, ctx.tz).ymd];
      if (!d) continue;
      d.count++;
      d.guests += r.guests;
      if (r.status === "PENDING") d.pending++;
    }
    return NextResponse.json({
      date: ymd,
      today,
      days,
      tz: ctx.tz,
      storeId,
      stores: stores.map((s) => ({ id: s.id, name: s.name })),
      capacity: ctx.capacity,
      settings: { enabled: ctx.settings.enabled, autoConfirm: ctx.settings.autoConfirm, durationMinutes: ctx.settings.durationMinutes },
      reservations: list,
      tableNames: Object.fromEntries(tables.map((t) => [t.id, t.name])),
    });
  } catch (err) {
    console.error("[GET /api/admin/reservas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  try {
    const a = await reservationsAuth(req, (await params).tenant);
    if ("error" in a) return a.error;
    const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const storeId = await storeForSession(a.tenant.id, a.session.storeId, typeof b.storeId === "string" ? b.storeId : null);
    if (!storeId) return NextResponse.json({ error: "No hay ningún local activo" }, { status: 400 });
    const ctx = await reservationContext(a.tenant, storeId);
    const startsAt = new Date(typeof b.at === "string" ? b.at : "");
    const guests = Math.floor(Number(b.guests));
    const name = cleanText(b.name, 80);
    const phone = cleanText(b.phone, 20).replace(/[\s-]/g, "");
    const email = cleanText(b.email, 120).toLowerCase() || null;
    if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: "Elige una hora" }, { status: 400 });
    if (!Number.isInteger(guests) || guests < 1 || guests > 200) return NextResponse.json({ error: "Indica cuántas personas son" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Escribe el nombre" }, { status: 400 });
    if (!isValidSpanishPhone(phone)) return NextResponse.json({ error: "Escribe un teléfono válido (9 cifras)" }, { status: 400 });
    if (email && !isValidEmail(email)) return NextResponse.json({ error: "El email no es válido" }, { status: 400 });
    const input = { startsAt, guests, name, phone, email, notes: cleanText(b.notes, 300) || null };
    let r;
    for (let i = 0; ; i++) {
      try {
        r = await createReservation({ ...ctx, settings: { ...ctx.settings, stepMinutes: 1 } }, input, { source: b.source === "WALKIN" ? "WALKIN" : "PHONE", userId: a.session.userId, staff: true, overCapacity: b.force === true });
        break;
      } catch (err) {
        if (i < 2 && isDuplicateCode(err)) continue;
        throw err;
      }
    }
    if (r.email) after(() => notifyReservation(r.id, "created"));
    return NextResponse.json({ id: r.id });
  } catch (err) {
    if (err instanceof ReservationError) return NextResponse.json({ error: err.message, full: err.message.startsWith("A esa hora solo quedan") }, { status: 409 });
    console.error("[POST /api/admin/reservas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
