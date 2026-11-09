import { describe, expect, it } from "vitest";
import { DEFAULT_RESERVATIONS, guestsAt, readReservationSettings, reservationSlots } from "../reservations";
import { parseHours } from "../storeStatus";

const TZ = "Europe/Madrid";
// Miércoles 11-11-2026, 10:00 en Madrid (09:00 UTC).
const NOW = new Date("2026-11-11T09:00:00Z");
const hours = parseHours({ mie: [{ from: "13:00", to: "16:00" }, { from: "20:00", to: "23:00" }], jue: [{ from: "13:00", to: "16:00" }] });
const base = { hours, closures: [], tz: TZ, now: NOW, settings: { ...DEFAULT_RESERVATIONS, enabled: true }, capacity: 10, bookings: [], guests: 2 };

describe("reservationSlots", () => {
  it("ofrece horas dentro del horario, sin la última media hora", () => {
    const times = reservationSlots({ ...base, ymd: "2026-11-11" }).map((s) => s.time);
    expect(times[0]).toBe("13:00");
    expect(times).toContain("15:30");
    expect(times).not.toContain("15:45");
    expect(times).toContain("20:00");
    expect(times.at(-1)).toBe("22:30");
  });

  it("respeta la antelación mínima", () => {
    const now = new Date("2026-11-11T12:10:00Z"); // 13:10 en Madrid
    const times = reservationSlots({ ...base, ymd: "2026-11-11", now }).map((s) => s.time);
    expect(times[0]).toBe("14:15"); // 60 min de antelación
  });

  it("no ofrece días pasados ni más allá del límite", () => {
    expect(reservationSlots({ ...base, ymd: "2026-11-10" })).toEqual([]);
    expect(reservationSlots({ ...base, ymd: "2027-01-30" })).toEqual([]);
  });

  it("marca sin sitio cuando el aforo está ocupado", () => {
    const bookings = [{ startsAt: "2026-11-11T12:00:00Z", durationMinutes: 90, guests: 9 }]; // 13:00 a 14:30
    const slots = reservationSlots({ ...base, ymd: "2026-11-11", bookings });
    expect(slots.find((s) => s.time === "13:30")).toMatchObject({ free: 1, available: false });
    expect(slots.find((s) => s.time === "14:30")).toMatchObject({ free: 10, available: true });
    // 12:00 no se ofrece (cerrado), y a las 13:00 con 1 persona sí cabe
    expect(reservationSlots({ ...base, ymd: "2026-11-11", bookings, guests: 1 }).find((s) => s.time === "13:00")?.available).toBe(true);
  });

  it("no ofrece horas durante un cierre", () => {
    const closures = [{ startsAt: "2026-11-11T19:00:00Z", endsAt: "2026-11-11T23:00:00Z" }];
    expect(reservationSlots({ ...base, ymd: "2026-11-11", closures }).some((s) => s.time >= "20:00")).toBe(false);
  });
});

describe("guestsAt", () => {
  it("suma solo las reservas que se solapan", () => {
    const b = [
      { startsAt: "2026-11-11T12:00:00Z", durationMinutes: 90, guests: 4 },
      { startsAt: "2026-11-11T13:30:00Z", durationMinutes: 90, guests: 3 },
    ];
    expect(guestsAt(b, new Date("2026-11-11T13:00:00Z"), 90)).toBe(7);
    expect(guestsAt(b, new Date("2026-11-11T15:00:00Z"), 90)).toBe(0);
  });
});

describe("readReservationSettings", () => {
  it("usa valores por defecto y limita los raros", () => {
    expect(readReservationSettings({})).toEqual(DEFAULT_RESERVATIONS);
    const r = readReservationSettings({ reservations: { enabled: true, durationMinutes: 5, maxGuestsOnline: 999, stepMinutes: 7 } });
    expect(r).toMatchObject({ enabled: true, durationMinutes: 30, maxGuestsOnline: 50, stepMinutes: 15 });
  });
});
