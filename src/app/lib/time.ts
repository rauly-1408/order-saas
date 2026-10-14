// Fechas en la zona horaria del restaurante. El servidor (Vercel) trabaja en
// UTC, así que "hoy" y las horas mostradas deben calcularse explícitamente.

export const DEFAULT_TIMEZONE = "Europe/Madrid";

// Lee settings.timezone del tenant si es una zona IANA válida.
export function tenantTimeZone(settings: unknown): string {
  const tz = (settings as Record<string, unknown> | null)?.timezone;
  if (typeof tz !== "string") return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

// Instante (UTC) en que empezó el día de hoy en `timeZone`.
export function startOfTodayIn(timeZone: string, now: Date = new Date()): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const wallClockAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = wallClockAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs);
}

export function formatTimeIn(timeZone: string, date: Date = new Date()): string {
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone });
}

// Día de la semana ISO (1 = lunes … 7 = domingo) y minutos desde medianoche, en `timeZone`.
export function wallClockIn(timeZone: string, now: Date = new Date()): { isoWeekday: number; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const isoWeekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { isoWeekday, minutes: +parts.hour * 60 + +parts.minute };
}
