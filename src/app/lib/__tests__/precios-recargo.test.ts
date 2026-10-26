import { describe, expect, it } from "vitest";
import { breakEven, costSettingsOf, markupPriceCents, withPrepMarkup } from "../pricing";

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
    expect(costSettingsOf({})).toMatchObject({ priceMode: "FOOD_COST", targetFoodCostPct: 30, markupPct: 60, prepMarkupPct: 0, fixedCosts: [] });
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
