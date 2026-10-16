// ¿Acepta pedidos el local ahora mismo? Horario semanal, cierres programados y
// pausa manual (Pedidos). Funciones puras: las usan el servidor (al crear el
// pedido), la carta pública y el panel. Ver docs/HORARIOS-Y-ZONAS.md

export const DAY_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const; // índice = día ISO − 1
export type DayKey = (typeof DAY_KEYS)[number];
export const DAY_LABEL: Record<DayKey, string> = { lun: "Lunes", mar: "Martes", mie: "Miércoles", jue: "Jueves", vie: "Viernes", sab: "Sábado", dom: "Domingo" };

export type TimeRange = { from: string; to: string }; // "HH:MM"
export type WeeklyHours = Record<DayKey, TimeRange[]>;

// "Hasta que lo reabras" se guarda como una fecha muy lejana.
export const PAUSE_INDEFINITE = new Date("2100-01-01T00:00:00Z");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  // 23:59 como cierre significa "hasta medianoche".
  return h === 23 && m === 59 ? 24 * 60 : h * 60 + m;
}

// Limpia el JSON guardado (acepta también el formato antiguo { open, close }).
export function parseHours(raw: unknown): WeeklyHours {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = {} as WeeklyHours;
  for (const d of DAY_KEYS) {
    const list = Array.isArray(r[d]) ? (r[d] as Record<string, unknown>[]) : [];
    out[d] = list
      .map((x) => ({ from: String(x.from ?? x.open ?? ""), to: String(x.to ?? x.close ?? "") }))
      .filter((x) => HHMM.test(x.from) && HHMM.test(x.to) && x.from !== x.to)
      .sort((a, b) => toMinutes(a.from) - toMinutes(b.from));
  }
  return out;
}

export function hasSchedule(h: WeeklyHours): boolean {
  return DAY_KEYS.some((d) => h[d].length > 0);
}

// ¿Está abierto el día ISO `isoDay` (1-7) en el minuto `m` (0-1439)?
export function openAt(h: WeeklyHours, isoDay: number, m: number): boolean {
  const today = DAY_KEYS[isoDay - 1];
  const yesterday = DAY_KEYS[(isoDay + 5) % 7];
  for (const r of h[today]) {
    const from = toMinutes(r.from);
    const to = toMinutes(r.to);
    if (to > from ? m >= from && m < to : m >= from) return true; // franja normal o que pasa de medianoche
  }
  for (const r of h[yesterday]) {
    const from = toMinutes(r.from);
    const to = toMinutes(r.to);
    if (to < from && m < to) return true; // cola de una franja de ayer que pasa de medianoche
  }
  return false;
}

// Próxima apertura: "hoy a las 20:00", "mañana a las 13:00", "el lunes a las 13:00".
export function nextOpeningLabel(h: WeeklyHours, isoDay: number, m: number): string | null {
  for (let k = 0; k < 8; k++) {
    const day = ((isoDay - 1 + k) % 7) + 1;
    const ranges = h[DAY_KEYS[day - 1]];
    const next = ranges.find((r) => k > 0 || toMinutes(r.from) > m);
    if (!next) continue;
    if (k === 0) return `hoy a las ${next.from}`;
    if (k === 1) return `mañana a las ${next.from}`;
    return `el ${DAY_LABEL[DAY_KEYS[day - 1]].toLowerCase()} a las ${next.from}`;
  }
  return null;
}

export function rangesLabel(ranges: TimeRange[]): string {
  return ranges.length ? ranges.map((r) => `${r.from}–${r.to}`).join(" · ") : "Cerrado";
}

export type StoreStatus =
  | { open: true; kind: "open"; message: string }
  | { open: false; kind: "paused" | "closure" | "hours"; message: string; reopens: string | null };

export type StatusInput = {
  hours: WeeklyHours;
  closures: { startsAt: Date; endsAt: Date; reason: string | null }[];
  pausedUntil: Date | null;
};

const fmtTime = (d: Date, tz: string) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });
const fmtDay = (d: Date, tz: string) => d.toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: tz });

export function storeStatus(input: StatusInput, now: Date, clock: { isoWeekday: number; minutes: number }, tz: string): StoreStatus {
  if (input.pausedUntil && input.pausedUntil > now) {
    const indefinite = input.pausedUntil >= PAUSE_INDEFINITE;
    return {
      open: false,
      kind: "paused",
      message: "Ahora mismo no estamos aceptando pedidos",
      reopens: indefinite ? null : `a las ${fmtTime(input.pausedUntil, tz)}`,
    };
  }
  const closure = input.closures.find((c) => c.startsAt <= now && now < c.endsAt);
  if (closure) {
    return {
      open: false,
      kind: "closure",
      message: closure.reason ? `Cerrado: ${closure.reason}` : "Cerrado temporalmente",
      reopens: `el ${fmtDay(closure.endsAt, tz)} a las ${fmtTime(closure.endsAt, tz)}`,
    };
  }
  if (!hasSchedule(input.hours) || openAt(input.hours, clock.isoWeekday, clock.minutes)) {
    return { open: true, kind: "open", message: "Abierto" };
  }
  return { open: false, kind: "hours", message: "Ahora mismo estamos cerrados", reopens: nextOpeningLabel(input.hours, clock.isoWeekday, clock.minutes) };
}

// ── Zonas de reparto ────────────────────────────────────────────────────
export type ZoneLike = { id: string; name: string; postalCodes: string[]; feeCents: number; minOrderCents: number };

export function normalizePostalCode(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 5);
}

export function zoneForPostalCode<Z extends ZoneLike>(zones: Z[], postalCode: string): Z | null {
  const cp = normalizePostalCode(postalCode);
  if (cp.length !== 5) return null;
  return zones.find((z) => z.postalCodes.includes(cp)) ?? null;
}
