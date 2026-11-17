import { describe, expect, it } from "vitest";
import { accuracyPct, forecastDay, shortfall, sumForecasts, type DaySales } from "../forecast";

const day = (ymd: string, orders: number, over: Partial<DaySales> = {}): DaySales => ({
  ymd,
  isoWeekday: (((new Date(ymd + "T12:00:00Z").getUTCDay() + 6) % 7) + 1),
  orders,
  revenueCents: orders * 1000,
  products: orders ? { bocata: orders * 2 } : {},
  ingredients: orders ? { mollete: orders * 2 } : {},
  hours: orders ? { 21: orders } : {},
  ...over,
});

// 2026-11-18 es miércoles.
describe("forecastDay", () => {
  it("usa solo el mismo día de la semana y pesa más lo reciente", () => {
    const h = [day("2026-11-11", 20), day("2026-11-04", 10), day("2026-11-10", 99)]; // el martes no cuenta
    const f = forecastDay(h, "2026-11-18", 3);
    expect(f.basedOn).toEqual(["2026-11-11", "2026-11-04"]);
    // pesos 8 y 7 → (20·8 + 10·7) / 15 = 15,33
    expect(f.orders).toBe(15);
    expect(f.ordersMin).toBe(10);
    expect(f.ordersMax).toBe(20);
    expect(f.products[0]).toEqual({ id: "bocata", units: 31, min: 20, max: 40 });
    expect(f.ingredients.mollete).toBeCloseTo(30.67, 1);
    expect(f.peakHour).toBe(21);
  });

  it("no cuenta los días cerrados (sin pedidos) ni lo de hace más de 8 semanas", () => {
    const h = [day("2026-11-11", 0), day("2026-11-04", 12), day("2026-09-16", 50)];
    const f = forecastDay(h, "2026-11-18", 3);
    expect(f.basedOn).toEqual(["2026-11-04"]);
    expect(f.orders).toBe(12);
  });

  it("sin historial devuelve cero", () => {
    const f = forecastDay([], "2026-11-18", 3);
    expect(f.orders).toBe(0);
    expect(f.products).toEqual([]);
    expect(f.peakHour).toBeNull();
  });

  it("no usa el propio día ni días futuros", () => {
    const f = forecastDay([day("2026-11-18", 40), day("2026-11-25", 40), day("2026-11-11", 10)], "2026-11-18", 3);
    expect(f.basedOn).toEqual(["2026-11-11"]);
  });
});

describe("sumForecasts", () => {
  it("suma platos e ingredientes de varios días", () => {
    const a = forecastDay([day("2026-11-11", 10)], "2026-11-18", 3);
    const b = forecastDay([day("2026-11-12", 5)], "2026-11-19", 4);
    const s = sumForecasts([a, b]);
    expect(s.orders).toBe(15);
    expect(s.products[0].units).toBe(30);
    expect(s.ingredients.mollete).toBeCloseTo(30);
  });
});

describe("accuracyPct y shortfall", () => {
  it("acierto", () => {
    expect(accuracyPct(40, 40)).toBe(100);
    expect(accuracyPct(40, 30)).toBe(75);
    expect(accuracyPct(0, 0)).toBeNull();
  });
  it("lo que falta con un 10 % de margen", () => {
    expect(shortfall(100, 50)).toBeCloseTo(60);
    expect(shortfall(100, 120)).toBe(0);
    expect(shortfall(100, -5)).toBeCloseTo(110);
  });
});
