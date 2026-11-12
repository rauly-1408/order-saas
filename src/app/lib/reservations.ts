// Reservas de mesa: ajustes del restaurante y cálculo de horas libres. Funciones
// puras (sin base de datos): las usan la página de reservar, el panel y la API,
// que es la que valida. Ver docs/RESERVAS.md
import { hasSchedule, openAt, type WeeklyHours } from "@/app/lib/storeStatus";
import { addDays, localParts, startOfDayIn, wallClockIn } from "@/app/lib/time";

export type ReservationSettings = {
  enabled: boolean; // se puede reservar desde la tienda
  autoConfirm: boolean; // confirmada al momento; si no, queda pendiente
  durationMinutes: number; // lo que ocupa una mesa
  maxGuestsOnline: number; // grupos mayores: que llamen
  minNoticeMinutes: number; // antelación mínima
  maxDaysAhead: number; // hasta cuántos días antes
  capacity: number; // comensales a la vez; 0 = suma de plazas de las mesas
  stepMinutes: number; // cada cuánto se ofrece una hora
  notifyEmail: boolean; // aviso por email al restaurante
  remindEmail: boolean; // recordatorio al cliente el día antes, con «confirmo que voy»
  waitlist: boolean; // si no hay sitio, el cliente se apunta a la lista de espera
  customerNote: string; // texto que ve el cliente al reservar
};

export const DEFAULT_RESERVATIONS: ReservationSettings = {
  enabled: false,
  autoConfirm: true,
  durationMinutes: 90,
  maxGuestsOnline: 8,
  minNoticeMinutes: 60,
  maxDaysAhead: 30,
  capacity: 0,
  stepMinutes: 15,
  notifyEmail: true,
  remindEmail: true,
  waitlist: true,
  customerNote: "",
};
export const FALLBACK_CAPACITY = 30; // sin mesas creadas ni aforo puesto

const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function readReservationSettings(settings: unknown): ReservationSettings {
  const r = (((settings ?? {}) as Record<string, unknown>).reservations ?? {}) as Record<string, unknown>;
  const d = DEFAULT_RESERVATIONS;
  return {
    enabled: r.enabled === true,
    autoConfirm: r.autoConfirm !== false,
    durationMinutes: int(r.durationMinutes, 30, 300, d.durationMinutes),
    maxGuestsOnline: int(r.maxGuestsOnline, 1, 50, d.maxGuestsOnline),
    minNoticeMinutes: int(r.minNoticeMinutes, 0, 2880, d.minNoticeMinutes),
    maxDaysAhead: int(r.maxDaysAhead, 1, 180, d.maxDaysAhead),
    capacity: int(r.capacity, 0, 2000, d.capacity),
    stepMinutes: [15, 30].includes(Number(r.stepMinutes)) ? Number(r.stepMinutes) : d.stepMinutes,
    notifyEmail: r.notifyEmail !== false,
    remindEmail: r.remindEmail !== false,
    waitlist: r.waitlist !== false,
    customerNote: typeof r.customerNote === "string" ? r.customerNote.trim().slice(0, 300) : "",
  };
}

// Lo que ocupa el local a una hora: reservas que se solapan con [at, at + duración).
export type Booking = { startsAt: Date | string; durationMinutes: number; guests: number };
export function guestsAt(bookings: Booking[], at: Date, durationMinutes: number): number {
  const start = at.getTime(), end = start + durationMinutes * 60_000;
  return bookings.reduce((sum, b) => {
    const s = new Date(b.startsAt).getTime(), e = s + b.durationMinutes * 60_000;
    return s < end && e > start ? sum + b.guests : sum;
  }, 0);
}

export type ReservationSlot = { at: string; time: string; free: number; available: boolean };

type SlotInput = {
  ymd: string; // día pedido, en la hora del restaurante
  hours: WeeklyHours;
  closures: { startsAt: Date | string; endsAt: Date | string }[];
  tz: string;
  now: Date;
  settings: ReservationSettings;
  capacity: number;
  bookings: Booking[];
  guests: number;
  ignoreNotice?: boolean; // el restaurante apunta reservas de última hora
};

const openInstant = (i: SlotInput, at: Date) => {
  if (i.closures.some((c) => new Date(c.startsAt) <= at && at < new Date(c.endsAt))) return false;
  if (!hasSchedule(i.hours)) return true;
  const clock = wallClockIn(i.tz, at);
  return openAt(i.hours, clock.isoWeekday, clock.minutes);
};

// Horas de un día: el local abierto al llegar y 30 minutos después (no se
// reserva justo antes de cerrar), dentro de la antelación y con sitio.
export function reservationSlots(i: SlotInput): ReservationSlot[] {
  const today = localParts(i.now, i.tz).ymd;
  // El límite de días es para la tienda; el restaurante (ignoreNotice) apunta para cuando quiera.
  if (i.ymd < today || (!i.ignoreNotice && i.ymd > addDays(today, i.settings.maxDaysAhead))) return [];
  const midnight = startOfDayIn(i.tz, i.ymd).getTime();
  const earliest = i.ignoreNotice ? i.now.getTime() - 3 * 3_600_000 : i.now.getTime() + i.settings.minNoticeMinutes * 60_000;
  const out: ReservationSlot[] = [];
  for (let m = 0; m < 24 * 60; m += i.settings.stepMinutes) {
    const at = new Date(midnight + m * 60_000);
    if (at.getTime() < earliest) continue;
    // En la tienda: abierto al menos 30 min más. El restaurante (ignoreNotice)
    // puede apuntar hasta la hora de cierre.
    if (!openInstant(i, at) || (!i.ignoreNotice && !openInstant(i, new Date(at.getTime() + 29 * 60_000)))) continue;
    const free = Math.max(0, i.capacity - guestsAt(i.bookings, at, i.settings.durationMinutes));
    out.push({ at: at.toISOString(), time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, free, available: free >= i.guests });
  }
  return out;
}

// «sábado 14 de noviembre a las 21:00»
export function reservationLabel(at: Date | string, tz: string, lang: "es" | "en" = "es"): string {
  const d = new Date(at);
  const day = d.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return lang === "en" ? `${day} at ${time}` : `${day} a las ${time}`;
}

export function isValidSpanishPhone(raw: string): boolean {
  return /^(?:\+34|0034)?[6789]\d{8}$/.test(raw.replace(/[\s-]/g, ""));
}
export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
