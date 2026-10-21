import { describe, expect, it } from "vitest";
import { includedTax, readCheckout, readTax, tipCents } from "@/app/lib/storePolicies";
import { foodCostHealth, margin, recipeCostCents, suggestedGrossPriceCents, unitCostCents } from "@/app/lib/costs";
import { computeSegment, normalizePhone } from "@/app/lib/retention";

describe("propinas e IVA", () => {
  it("la propina se calcula sobre la comida, nunca negativa", () => {
    expect(tipCents(1000, 10)).toBe(100);
    expect(tipCents(1995, 5)).toBe(100);
    expect(tipCents(-50, 10)).toBe(0);
    expect(tipCents(1000, 0)).toBe(0);
  });
  it("el IVA incluido en un precio con IVA", () => {
    expect(includedTax(1100, 10)).toBe(100);
    expect(includedTax(1210, 21)).toBe(210);
    expect(includedTax(0, 10)).toBe(0);
  });
  it("lee los ajustes con valores seguros", () => {
    expect(readTax({ tax: { rate: 99 } }).rate).toBe(10);
    expect(readTax({ tax: { rate: 21 } }).rate).toBe(21);
    const c = readCheckout({ checkout: { tips: { enabled: true, percents: [50, 5, 5, 10, 0] } } });
    expect(c.tips).toEqual({ enabled: true, percents: [5, 10] });
    expect(readCheckout(null).tips.enabled).toBe(false);
  });
});

describe("costes y margen", () => {
  it("la merma encarece el coste útil", () => {
    expect(unitCostCents({ packSize: 1000, packPriceCents: 1000, wastePct: 0 })).toBe(1);
    expect(unitCostCents({ packSize: 1000, packPriceCents: 1000, wastePct: 20 })).toBeCloseTo(1.25);
    expect(unitCostCents({ packSize: 0, packPriceCents: 1000, wastePct: 0 })).toBe(0);
  });
  it("el margen se calcula sobre el precio sin IVA", () => {
    const m = margin(300, 1100, 10);
    expect(m.priceCents).toBeCloseTo(1000);
    expect(m.marginCents).toBeCloseTo(700);
    expect(m.foodCostPct).toBeCloseTo(30);
    expect(foodCostHealth(29)).toBe("good");
    expect(foodCostHealth(35)).toBe("warn");
    expect(foodCostHealth(45)).toBe("bad");
  });
  it("sugiere el precio de carta para un food cost objetivo", () => {
    expect(suggestedGrossPriceCents(300, 30, 10)).toBe(1100);
    expect(recipeCostCents([{ quantity: 200, ingredient: { packSize: 1000, packPriceCents: 500, wastePct: 0 } }])).toBe(100);
  });
});

describe("clientes", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("segmenta por pedidos, gasto y tiempo sin venir", () => {
    expect(computeSegment(1, 1500, now, now)).toBe("NEW");
    expect(computeSegment(3, 4000, now, now)).toBe("REGULAR");
    expect(computeSegment(6, 4000, now, now)).toBe("VIP");
    expect(computeSegment(2, 20000, now, now)).toBe("VIP");
    expect(computeSegment(3, 4000, new Date("2026-06-01T12:00:00Z"), now)).toBe("AT_RISK");
  });
  it("normaliza teléfonos", () => {
    expect(normalizePhone(" 600 11 12 22 ")).toBe("600111222");
    expect(normalizePhone("+34 600-111-222")).toBe("+34600111222");
  });
});
