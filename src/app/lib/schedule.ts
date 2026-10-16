// Pedidos programados: el cliente elige "hoy a las 20:30" o "mañana a las
// 13:15" (también con la tienda cerrada). Funciones puras: las usan la carta,
// el checkout y la API de pedidos, que es la que valida. Ver docs/PEDIDOS-PROGRAMADOS.md
import { hasSchedule, openAt, type WeeklyHours } from "@/app/lib/storeStatus";
import { addDays, localParts, startOfDayIn, wallClockIn } from "@/app/lib/time";

export const SLOT_STEP_MIN = 15;
export const SCHEDULE_DAYS = 3; // hoy y los dos días siguientes

export type ScheduleInput = {
  hours: WeeklyHours;
  closures: { startsAt: Date | string; endsAt: Date | string }[];
  pausedUntil: Date | string | null;
};

export type Slot = { at: string; day: string; time: string }; // ISO, "Hoy" / "Mañana" / "Sábado 18", "20:30"

const DAY_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// ¿Se puede entregar/recoger en ese instante? (abierto, sin cierre ni pausa).
export function slotOpen(input: ScheduleInput, at: Date, tz: string): boolean {
  if (input.pausedUntil && new Date(input.pausedUntil) > at) return false;
  if (input.closures.some((c) => new Date(c.startsAt) <= at && at < new Date(c.endsAt))) return false;
  if (!hasSchedule(input.hours)) return true;
  const clock = wallClockIn(tz, at);
  return openAt(input.hours, clock.isoWeekday, clock.minutes);
}

// Una hora vale si el local está abierto a esa hora Y cuando la cocina tiene
// que empezar a prepararlo (hora − tiempo de preparación/entrega).
export function slotWorkable(input: ScheduleInput, at: Date, tz: string, leadMin: number): boolean {
  return slotOpen(input, at, tz) && slotOpen(input, new Date(at.getTime() - leadMin * 60_000), tz);
}

// Horas disponibles desde `now + leadMin` (tiempo de preparación/entrega) en
// los próximos días, cada 15 minutos.
export function availableSlots(input: ScheduleInput, now: Date, tz: string, leadMin: number): Slot[] {
  const earliest = now.getTime() + leadMin * 60_000;
  const today = localParts(now, tz).ymd;
  const out: Slot[] = [];
  for (let d = 0; d < SCHEDULE_DAYS; d++) {
    const ymd = addDays(today, d);
    const midnight = startOfDayIn(tz, ymd).getTime();
    const isoDay = localParts(new Date(midnight + 12 * 3_600_000), tz).isoWeekday;
    const day = d === 0 ? "Hoy" : d === 1 ? "Mañana" : `${DAY_NAMES[isoDay - 1]} ${Number(ymd.slice(8))}`;
    for (let m = 0; m < 24 * 60; m += SLOT_STEP_MIN) {
      const at = new Date(midnight + m * 60_000);
      if (at.getTime() < earliest || !slotWorkable(input, at, tz, leadMin)) continue;
      out.push({ at: at.toISOString(), day, time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}` });
    }
  }
  return out;
}

// Motivo por el que una hora programada no vale, o null si es válida.
export function scheduleProblem(input: ScheduleInput, at: Date, now: Date, tz: string, leadMin: number): string | null {
  if (Number.isNaN(at.getTime())) return "La hora elegida no es válida";
  if (at.getTime() < now.getTime() + leadMin * 60_000 - 60_000) return "Esa hora ya no llega a tiempo: elige una más tarde";
  if (at.getTime() > now.getTime() + SCHEDULE_DAYS * 86_400_000) return "Solo se puede programar para los próximos días";
  if (wallClockIn(tz, at).minutes % SLOT_STEP_MIN !== 0) return "La hora elegida no es válida";
  if (!slotWorkable(input, at, tz, leadMin)) return "A esa hora no estamos abiertos: elige otra";
  return null;
}

// "hoy a las 20:30", "mañana a las 13:15", "el sábado 18 a las 21:00".
export function scheduledLabel(at: Date | string, now: Date, tz: string): string {
  const date = new Date(at);
  const today = localParts(now, tz).ymd;
  const p = localParts(date, tz);
  const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  if (p.ymd === today) return `hoy a las ${time}`;
  if (p.ymd === addDays(today, 1)) return `mañana a las ${time}`;
  return `el ${DAY_NAMES[p.isoWeekday - 1].toLowerCase()} ${Number(p.ymd.slice(8))} a las ${time}`;
}
