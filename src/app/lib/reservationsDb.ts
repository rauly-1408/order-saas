// Reservas: lectura y escritura en la base de datos, comprobación de aforo y
// avisos por email. La parte pura está en lib/reservations.ts. Ver docs/RESERVAS.md
import { randomBytes } from "node:crypto";
import { Prisma, type ReservationSource, type ReservationStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { parseHours } from "@/app/lib/storeStatus";
import { addDays, localParts, startOfDayIn, tenantTimeZone } from "@/app/lib/time";
import { readBusiness } from "@/app/lib/business";
import { emailConfigured, reservationCustomerEmail, reservationRestaurantEmail, sendEmail } from "@/app/lib/email";
import { FALLBACK_CAPACITY, readReservationSettings, reservationLabel, reservationSlots, type ReservationSettings } from "@/app/lib/reservations";

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

export type NewReservation = { startsAt: Date; guests: number; name: string; phone: string; email: string | null; notes: string | null };

// Crea la reserva comprobando el aforo dentro de una transacción con candado
// por local: dos clientes a la vez no pueden pasarse del aforo.
// staff = la apunta el restaurante: puede saltarse la antelación y el aforo.
export async function createReservation(ctx: Ctx, input: NewReservation, opts: { source: ReservationSource; userId?: string | null; staff?: boolean; overCapacity?: boolean }) {
  const ymd = localParts(input.startsAt, ctx.tz).ymd;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"reservas:" + ctx.storeId}))`;
    if (!opts.staff || !opts.overCapacity) {
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
    return tx.reservation.create({
      data: {
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
        status: opts.source === "ONLINE" && !ctx.settings.autoConfirm ? "PENDING" : "CONFIRMED",
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
  if (!emailConfigured()) return;
  try {
    const r = await prisma.reservation.findUnique({ where: { id }, include: { tenant: { select: { slug: true, name: true, settings: true } }, store: { select: { name: true, address: true } } } });
    if (!r) return;
    const tz = tenantTimeZone(r.tenant.settings);
    const biz = readBusiness(r.tenant.settings);
    const when = reservationLabel(r.startsAt, tz, lang);
    if (r.email) {
      const msg = reservationCustomerEmail({ restaurant: r.tenant.name, when, guests: r.guests, status: r.status, event, address: r.store.address || [biz.street, biz.city].filter(Boolean).join(", ") || null, phone: biz.phone, link: reservationLink(r.tenant.slug, r.code), lang });
      await sendEmail({ to: r.email, ...msg, ...(biz.email && { replyTo: biz.email }) });
    }
    const settings = readReservationSettings(r.tenant.settings);
    if ((event === "created" || (event === "cancelled" && r.cancelledBy === "CUSTOMER")) && biz.email && settings.notifyEmail && r.source === "ONLINE") {
      const msg = reservationRestaurantEmail({ restaurant: r.tenant.name, when: reservationLabel(r.startsAt, tz), guests: r.guests, name: r.name, phone: r.phone, notes: r.notes, pending: r.status === "PENDING", cancelled: event === "cancelled", panelUrl: `${appOrigin()}/admin/${r.tenant.slug}/reservas?fecha=${localParts(r.startsAt, tz).ymd}` });
      await sendEmail({ to: biz.email, ...msg });
    }
  } catch (err) {
    console.error("[notifyReservation]", err);
  }
}

export function isDuplicateCode(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
