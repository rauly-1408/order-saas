import { describe, expect, it } from "vitest";
import { breakEven, costSettingsOf, dishVerdict, markupPriceCents, withPrepMarkup } from "../pricing";

describe("precio con recargo sobre coste", () => {
  it("coste × 1,60, redondeado a 5 céntimos hacia arriba", () => {
    expect(markupPriceCents(300, 60)).toBe(480);
    expect(markupPriceCents(301, 60)).toBe(485);
    expect(markupPriceCents(0, 60)).toBe(0);
  });
  it("las elaboraciones llegan al local con el recargo del obrador", () => {
    const [prep, raw] = withPrepMarkup([{ isPrep: true, packPriceCents: 1000 }, { isPrep: false, packPriceCents: 1000 }], 30);
    expect(prep.packPriceCents).toBe(1300);
    expect(raw.packPriceCents).toBe(1000);
  });
});

describe("ajustes de costes", () => {
  it("sin nada guardado, food cost 30 % como hasta ahora", () => {
    expect(costSettingsOf({})).toMatchObject({ priceMode: "FOOD_COST", targetFoodCostPct: 30, targetMarginPct: 70, markupPct: 60, markupIncludesVat: true, prepMarkupPct: 0, fixedCosts: [] });
  });
  it("sanea lo guardado", () => {
    const s = costSettingsOf({ costs: { priceMode: "MARKUP", markupPct: "60", prepMarkupPct: 30, openDaysPerMonth: 99, fixedCosts: [{ label: " Alquiler ", cents: 150000 }, { label: "", cents: 5 }, { label: "Luz", cents: -1 }] } });
    expect(s).toMatchObject({ priceMode: "MARKUP", markupPct: 60, prepMarkupPct: 30, openDaysPerMonth: 31, fixedCosts: [{ label: "Alquiler", cents: 150000 }] });
  });
});

describe("punto de equilibrio", () => {
  it("gastos fijos al día y productos que hay que vender", () => {
    // 5.200 € al mes, 26 días → 200 €/día; 2,50 € de margen por producto → 80 al día
    expect(breakEven(520_000, 26, 250)).toEqual({ perDayCents: 20_000, itemsPerDay: 80 });
  });
  it("sin margen conocido no hay número de productos", () => {
    expect(breakEven(520_000, 26, null).itemsPerDay).toBeNull();
  });
});

describe("veredicto de cada plato", () => {
  const recargo = { priceMode: "MARKUP" as const, markupPct: 60, markupIncludesVat: true, targetFoodCostPct: 30, targetMarginPct: 70 };
  it("Genil: coste 7,12 €, carta 9,95 € → recargo 40 %, no llega al 60 %", () => {
    const v = dishVerdict(712, 995, recargo);
    expect(Math.round(v.markupPct!)).toBe(40);
    expect(v.meets).toBe(false);
    expect(Math.round(v.netCents)).toBe(905);
    expect(Math.round(v.profitCents)).toBe(193);
    expect(v.targetPriceCents).toBe(1140);
  });
  it("llega al objetivo con recargo", () => {
    expect(dishVerdict(500, 800, recargo).meets).toBe(true);
  });
  it("con food cost: coste 3 €, carta 11 € (10 € sin IVA) → 30 %, llega", () => {
    const v = dishVerdict(300, 1100, { ...recargo, priceMode: "FOOD_COST" });
    expect(v.foodCostPct).toBeCloseTo(30);
    expect(v.meets).toBe(true);
  });
  it("recargo sin IVA: coste 5 € × 1,60 = 8 € sin IVA → 8,80 € en carta", () => {
    const s = { ...recargo, markupIncludesVat: false };
    expect(dishVerdict(500, 880, s).meets).toBe(true);
    expect(dishVerdict(500, 880, s).targetPriceCents).toBe(880);
    expect(Math.round(dishVerdict(500, 880, s).markupPct!)).toBe(60);
  });
  it("con margen: coste 3 €, carta 11 € → te queda el 70 %, llega", () => {
    const v = dishVerdict(300, 1100, { ...recargo, priceMode: "MARGIN" });
    expect(v.marginPct).toBeCloseTo(70);
    expect(v.meets).toBe(true);
    expect(v.targetPriceCents).toBe(1100);
  });
  it("sin coste no hay veredicto", () => {
    expect(dishVerdict(0, 995, recargo).meets).toBeNull();
  });
});
