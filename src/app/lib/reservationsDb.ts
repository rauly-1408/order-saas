// Reservas: lectura y escritura en la base de datos, comprobación de aforo y
// avisos por email. La parte pura está en lib/reservations.ts. Ver docs/RESERVAS.md
import { randomBytes } from "node:crypto";
import { Prisma, type ReservationSource, type ReservationStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { parseHours } from "@/app/lib/storeStatus";
import { addDays, localParts, startOfDayIn, tenantTimeZone } from "@/app/lib/time";
import { readBusiness } from "@/app/lib/business";
import { emailConfigured, reservationCustomerEmail, reservationReminderEmail, reservationRestaurantEmail, sendEmail, waitlistEmail } from "@/app/lib/email";
import { FALLBACK_CAPACITY, readReservationSettings, reservationLabel, reservationSlots, type ReservationSettings } from "@/app/lib/reservations";
import { readCombos, tableOptions } from "@/app/lib/tableCombos";
import { sendPush } from "@/app/lib/push";

export const ACTIVE: ReservationStatus[] = ["PENDING", "CONFIRMED", "SEATED"];

export class ReservationError extends Error {}

type Ctx = { tenantId: string; storeId: string; tz: string; settings: ReservationSettings; capacity: number };

export async function reservationContext(tenant: { id: string; settings: unknown }, storeId: string): Promise<Ctx> {
  const settings = readReservationSettings(tenant.settings);
  let capacity = settings.capacity;
  if (!capacity) {
    const seats = await prisma.diningTable.aggregate({ where: { storeId, isActive: true }, _sum: { seats: true } });
    capacity = seats._sum.seats || FALLBACK_CAPACITY;
  }
  return { tenantId: tenant.id, storeId, tz: tenantTimeZone(tenant.settings), settings, capacity };
}

// Reservas que ocupan sitio un día (con margen por las que empiezan la víspera).
async function bookingsAround(ctx: Ctx, ymd: string, db: Prisma.TransactionClient = prisma) {
  const from = new Date(startOfDayIn(ctx.tz, ymd).getTime() - 6 * 3_600_000);
  const to = startOfDayIn(ctx.tz, addDays(ymd, 1));
  return db.reservation.findMany({ where: { storeId: ctx.storeId, status: { in: ACTIVE }, startsAt: { gte: from, lt: to } }, select: { startsAt: true, durationMinutes: true, guests: true } });
}

export async function slotsFor(ctx: Ctx, ymd: string, guests: number, opts: { ignoreNotice?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const [store, bookings] = await Promise.all([
    prisma.store.findUnique({ where: { id: ctx.storeId }, select: { openingHours: true, closures: { where: { endsAt: { gt: now } }, select: { startsAt: true, endsAt: true } } } }),
    bookingsAround(ctx, ymd),
  ]);
  return reservationSlots({ ymd, hours: parseHours(store?.openingHours), closures: store?.closures ?? [], tz: ctx.tz, now, settings: ctx.settings, capacity: ctx.capacity, bookings, guests, ignoreNotice: opts.ignoreNotice });
}

// Mesas ocupadas a una hora: las de otras reservas que se solapan y, si la
// reserva empieza en la próxima hora y media, las que tienen la cuenta abierta.
async function busyTables(storeId: string, startsAt: Date, durationMinutes: number, excludeId: string | null, db: Prisma.TransactionClient = prisma): Promise<Set<string>> {
  const from = new Date(startsAt.getTime() - 6 * 3_600_000), to = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const [others, open] = await Promise.all([
    db.reservation.findMany({ where: { storeId, status: { in: ACTIVE }, startsAt: { gte: from, lt: to }, ...(excludeId && { id: { not: excludeId } }) }, select: { startsAt: true, durationMinutes: true, tableIds: true } }),
    startsAt.getTime() < Date.now() + 90 * 60_000 ? db.order.findMany({ where: { storeId, status: "OPEN", tableId: { not: null } }, select: { tableId: true, joinedTableIds: true } }) : Promise.resolve([]),
  ]);
  const busy = new Set(open.flatMap((o) => [o.tableId!, ...o.joinedTableIds]));
  for (const r of others) if (r.startsAt.getTime() + r.durationMinutes * 60_000 > startsAt.getTime()) r.tableIds.forEach((id) => busy.add(id));
  return busy;
}

// Opciones de mesa para una reserva (la primera es la sugerida).
export async function optionsFor(storeId: string, startsAt: Date, durationMinutes: number, guests: number, excludeId: string | null = null, db: Prisma.TransactionClient = prisma) {
  const [store, tables, busy] = await Promise.all([
    db.store.findUnique({ where: { id: storeId }, select: { tableCombos: true } }),
    db.diningTable.findMany({ where: { storeId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, seats: true, zone: true } }),
    busyTables(storeId, startsAt, durationMinutes, excludeId, db),
  ]);
  return tableOptions(tables, readCombos(store?.tableCombos, new Set(tables.map((t) => t.id))), guests, busy);
}

export type NewReservation = { startsAt: Date; guests: number; name: string; phone: string; email: string | null; notes: string | null };

// Crea la reserva comprobando el aforo dentro de una transacción con candado
// por local: dos clientes a la vez no pueden pasarse del aforo.
// staff = la apunta el restaurante: puede saltarse la antelación y el aforo.
// waitlist = lista de espera: la hora debe existir, pero no ocupa sitio ni mesa.
export async function createReservation(ctx: Ctx, input: NewReservation, opts: { source: ReservationSource; userId?: string | null; staff?: boolean; overCapacity?: boolean; waitlist?: boolean }) {
  const ymd = localParts(input.startsAt, ctx.tz).ymd;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reservas:" + ctx.storeId}))`;
    if (opts.waitlist) {
      const slots = await slotsFor(ctx, ymd, input.guests);
      if (!slots.some((s) => s.at === input.startsAt.toISOString())) throw new ReservationError("Esa hora ya no está disponible: elige otra");
    } else if (!opts.staff || !opts.overCapacity) {
      const slots = await slotsFor(ctx, ymd, input.guests, { ignoreNotice: opts.staff });
      const slot = slots.find((s) => s.at === input.startsAt.toISOString());
      if (!slot) throw new ReservationError(opts.staff ? "A esa hora el local está cerrado" : "Esa hora ya no está disponible: elige otra");
      // Recalcular dentro del candado con las reservas de este momento.
      const fresh = await bookingsAround(ctx, ymd, tx);
      const used = fresh.reduce((sum, b) => {
        const s = b.startsAt.getTime(), e = s + b.durationMinutes * 60_000, a = input.startsAt.getTime();
        return s < a + ctx.settings.durationMinutes * 60_000 && e > a ? sum + b.guests : sum;
      }, 0);
      if (used + input.guests > ctx.capacity) throw new ReservationError(opts.staff ? `A esa hora solo quedan ${Math.max(0, ctx.capacity - used)} plazas` : "Ya no queda sitio a esa hora: elige otra");
    }
    // Mesa: la mejor libre a esa hora (se puede cambiar en Reservas).
    const best = opts.waitlist ? null : (await optionsFor(ctx.storeId, input.startsAt, ctx.settings.durationMinutes, input.guests, null, tx)).find((o) => o.fits);
    return tx.reservation.create({
      data: {
        tableIds: best?.tableIds ?? [],
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        code: randomBytes(12).toString("base64url"),
        startsAt: input.startsAt,
        durationMinutes: ctx.settings.durationMinutes,
        guests: input.guests,
        name: input.name,
        phone: input.phone,
        email: input.email,
        notes: input.notes,
        status: opts.waitlist ? "WAITLIST" : opts.source === "ONLINE" && !ctx.settings.autoConfirm ? "PENDING" : "CONFIRMED",
        seenAt: opts.source === "ONLINE" ? null : new Date(), // las de la web: puntito y «Nueva» hasta que se vean
        source: opts.source,
        createdByUserId: opts.userId ?? null,
      },
    });
  });
}

function appOrigin(): string {
  const v = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return v || "http://localhost:3000";
}
export const reservationLink = (slug: string, code: string) => `${appOrigin()}/pedir/${slug}/reserva/${code}`;

// Avisos por email: al cliente (si dejó email) y al restaurante. Nunca lanza.
export async function notifyReservation(id: string, event: "created" | "confirmed" | "cancelled", lang: "es" | "en" = "es"): Promise<void> {
  // Aviso al móvil del restaurante (aunque no haya email configurado).
  if (event === "created") {
    try {
      const r = await prisma.reservation.findUnique({ where: { id }, select: { source: true, status: true, name: true, guests: true, startsAt: true, tenantId: true, tenant: { select: { slug: true, settings: true } } } });
      if (r && r.source === "ONLINE") {
        const tz = tenantTimeZone(r.tenant.settings);
        await sendPush(
          { tenantId: r.tenantId, audience: "PANEL" },
          {
            title: r.status === "WAITLIST" ? "Lista de espera: piden mesa" : r.status === "PENDING" ? "Reserva por confirmar" : "Nueva reserva",
            body: `${r.name} · ${r.guests} ${r.guests === 1 ? "persona" : "personas"} · ${reservationLabel(r.startsAt, tz)}`,
            url: `/admin/${r.tenant.slug}/reservas?fecha=${localParts(r.startsAt, tz).ymd}`,
            tag: `reserva-${id}`,
          }
        );
      }
    } catch (err) {
      console.error("[notifyReservation push]", err);
    }
  }
  if (!emailConfigured()) return;
  try {
    const r = await prisma.reservation.findUnique({ where: { id }, include: { tenant: { select: { slug: true, name: true, settings: true } }, store: { select: { name: true, address: true } } } });
    if (!r) return;
    const tz = tenantTimeZone(r.tenant.settings);
    const biz = readBusiness(r.tenant.settings);
    const when = reservationLabel(r.startsAt, tz, lang);
    const waiting = r.status === "WAITLIST";
    if (r.email && waiting && event === "created") {
      await sendEmail({ to: r.email, ...waitlistEmail({ restaurant: r.tenant.name, when, guests: r.guests, kind: "joined", link: reservationLink(r.tenant.slug, r.code), lang }), ...(biz.email && { replyTo: biz.email }) });
    } else if (r.email) {
      const msg = reservationCustomerEmail({ restaurant: r.tenant.name, when, guests: r.guests, status: r.status, event, address: r.store.address || [biz.street, biz.city].filter(Boolean).join(", ") || null, phone: biz.phone, link: reservationLink(r.tenant.slug, r.code), lang });
      await sendEmail({ to: r.email, ...msg, ...(biz.email && { replyTo: biz.email }) });
    }
    const settings = readReservationSettings(r.tenant.settings);
    if ((event === "created" || (event === "cancelled" && r.cancelledBy === "CUSTOMER")) && biz.email && settings.notifyEmail && r.source === "ONLINE") {
      const msg = reservationRestaurantEmail({ restaurant: r.tenant.name, when: reservationLabel(r.startsAt, tz), guests: r.guests, name: r.name, phone: r.phone, notes: r.notes, pending: r.status === "PENDING", waitlist: waiting, cancelled: event === "cancelled", panelUrl: `${appOrigin()}/admin/${r.tenant.slug}/reservas?fecha=${localParts(r.startsAt, tz).ymd}` });
      await sendEmail({ to: biz.email, ...msg });
    }
  } catch (err) {
    console.error("[notifyReservation]", err);
  }
}

export function isDuplicateCode(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// Recordatorio por email a quien reservó para hoy (más de 2 h por delante) o
// mañana: con «confirmar o cancelar». Lo llama el cron diario de la mañana.
export async function sendReminders(now = new Date()): Promise<number> {
  if (!emailConfigured()) return 0;
  const list = await prisma.reservation.findMany({
    where: { status: "CONFIRMED", email: { not: null }, reminderSentAt: null, startsAt: { gte: new Date(now.getTime() + 2 * 3_600_000), lt: new Date(now.getTime() + 40 * 3_600_000) } },
    include: { tenant: { select: { slug: true, name: true, settings: true } }, store: { select: { address: true } } },
    take: 500,
  });
  let sent = 0;
  for (const r of list) {
    if (!readReservationSettings(r.tenant.settings).remindEmail) continue;
    try {
      const tz = tenantTimeZone(r.tenant.settings);
      const biz = readBusiness(r.tenant.settings);
      const msg = reservationReminderEmail({ restaurant: r.tenant.name, when: reservationLabel(r.startsAt, tz), guests: r.guests, address: r.store.address || [biz.street, biz.city].filter(Boolean).join(", ") || null, link: reservationLink(r.tenant.slug, r.code), lang: "es" });
      if (await sendEmail({ to: r.email!, ...msg, ...(biz.email && { replyTo: biz.email }) })) {
        await prisma.reservation.update({ where: { id: r.id }, data: { reminderSentAt: new Date() } });
        sent++;
      }
    } catch (err) {
      console.error("[sendReminders]", r.id, err);
    }
  }
  return sent;
}

// Al liberarse sitio (una cancelación), avisa a la lista de espera de ese día
// cuyo grupo ahora cabe a su hora. Una vez por persona. Nunca lanza.
export async function notifyWaitlist(tenant: { id: string; slug: string; name: string; settings: unknown }, storeId: string, freedAt: Date): Promise<void> {
  if (!emailConfigured()) return;
  try {
    const ctx = await reservationContext(tenant, storeId);
    const ymd = localParts(freedAt, ctx.tz).ymd;
    const waiting = await prisma.reservation.findMany({
      where: { storeId, status: "WAITLIST", email: { not: null }, waitlistNotifiedAt: null, startsAt: { gte: startOfDayIn(ctx.tz, ymd), lt: startOfDayIn(ctx.tz, addDays(ymd, 1)) } },
      orderBy: { createdAt: "asc" },
    });
    if (!waiting.length) return;
    const slots = await slotsFor(ctx, ymd, 1);
    for (const w of waiting) {
      const slot = slots.find((s) => s.at === w.startsAt.toISOString());
      if (!slot || slot.free < w.guests) continue;
      const link = `${appOrigin()}/pedir/${tenant.slug}/reservar?fecha=${ymd}&personas=${w.guests}`;
      await sendEmail({ to: w.email!, ...waitlistEmail({ restaurant: tenant.name, when: reservationLabel(w.startsAt, ctx.tz), guests: w.guests, kind: "spot", link, lang: "es" }) });
      await prisma.reservation.update({ where: { id: w.id }, data: { waitlistNotifiedAt: new Date() } });
    }
  } catch (err) {
    console.error("[notifyWaitlist]", err);
  }
}
