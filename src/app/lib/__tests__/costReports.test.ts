import { describe, expect, it } from "vitest";
import { dishAllergens, packsText, priceRiseReport, type ReportIngredient, type ReportProduct } from "../costReports";

const ing = (id: string, over: Partial<ReportIngredient> = {}): ReportIngredient => ({
  id,
  name: id,
  baseUnit: "G",
  isPrep: false,
  prepLines: [],
  packSize: 1000,
  packPriceCents: 100,
  wastePct: 0,
  ...over,
});
const dish = (id: string, over: Partial<ReportProduct> = {}): ReportProduct => ({ id, name: id, basePriceCents: 500, recipeLines: [], modifierGroups: [], ...over });

describe("packsText", () => {
  it("cuenta el stock en formatos de compra", () => {
    expect(packsText(3500, 1000, "G")).toBe("≈ 3,5 bultos de 1 kg");
    expect(packsText(1000, 1000, "G")).toBe("≈ 1 bulto de 1 kg");
    expect(packsText(30, 12, "UNIT")).toBe("≈ 2,5 bultos de 12 ud");
  });
  it("no lo enseña cuando no aporta", () => {
    expect(packsText(0, 1000, "G")).toBeNull();
    expect(packsText(5, 1, "UNIT")).toBeNull();
    expect(packsText(5, 0, "G")).toBeNull();
  });
});

describe("priceRiseReport", () => {
  const since = new Date("2026-10-01");
  it("compara el precio de antes del periodo con el de hoy y lo lleva a cada plato", () => {
    const harina = ing("harina", { packPriceCents: 120 }); // antes 100 → +20 %
    const pan = dish("pan", { recipeLines: [{ ingredientId: "harina", quantity: 500 }] });
    const r = priceRiseReport(
      [
        { ingredientId: "harina", oldPackSize: 1000, oldPackPriceCents: 100, createdAt: "2026-10-05T10:00:00Z" },
        { ingredientId: "harina", oldPackSize: 1000, oldPackPriceCents: 110, createdAt: "2026-10-20T10:00:00Z" },
      ],
      [harina],
      [pan],
      { pan: 10 },
      since
    );
    expect(r).toHaveLength(1);
    expect(r[0].pct).toBeCloseTo(20);
    expect(r[0].dishes[0].deltaCents).toBeCloseTo(10); // 500 g × 0,02 c/g
    expect(r[0].monthlyCents).toBeCloseTo(100); // 10 platos al mes
  });

  it("ignora cambios anteriores al periodo", () => {
    const r = priceRiseReport([{ ingredientId: "a", oldPackSize: 1000, oldPackPriceCents: 50, createdAt: "2026-09-01T00:00:00Z" }], [ing("a")], [], {}, since);
    expect(r).toEqual([]);
  });

  it("llega a los platos a través de una elaboración", () => {
    const aceite = ing("aceite", { baseUnit: "ML", packPriceCents: 200 }); // antes 100
    const salsa = ing("salsa", { isPrep: true, packSize: 500, prepLines: [{ ingredientId: "aceite", quantity: 250 }] });
    const bocata = dish("bocata", { recipeLines: [{ ingredientId: "salsa", quantity: 50 }] });
    const r = priceRiseReport([{ ingredientId: "aceite", oldPackSize: 1000, oldPackPriceCents: 100, createdAt: "2026-10-10T00:00:00Z" }], [aceite, salsa], [bocata], {}, since);
    // 250 ml de aceite por 500 g de salsa → 0,05 c más por gramo de salsa; 50 g → 2,5 c
    expect(r[0].dishes[0].deltaCents).toBeCloseTo(2.5);
  });

  it("cuenta la opción por defecto de los grupos obligatorios", () => {
    const mollete = ing("mollete", { baseUnit: "UNIT", packSize: 10, packPriceCents: 300 }); // antes 200
    const p = dish("p", {
      modifierGroups: [{ defaultOptionId: "o1", group: { name: "Pan", isRequired: true, options: [{ id: "o1", name: "Mollete", recipeLines: [{ ingredientId: "mollete", quantity: 1 }] }] } }],
    });
    const r = priceRiseReport([{ ingredientId: "mollete", oldPackSize: 10, oldPackPriceCents: 200, createdAt: "2026-10-10T00:00:00Z" }], [mollete], [p], {}, since);
    expect(r[0].dishes[0].deltaCents).toBeCloseTo(10);
  });
});

describe("dishAllergens", () => {
  const al = new Map([
    ["harina", ["Gluten"]],
    ["queso", ["Lácteos"]],
    ["mostaza", ["Mostaza"]],
  ]);
  it("une receta y declarados, en el orden oficial, y separa lo que añaden las opciones", () => {
    const p = dish("p", {
      allergens: ["Huevos"],
      recipeLines: [{ ingredientId: "queso", quantity: 1 }, { ingredientId: "harina", quantity: 1 }],
      modifierGroups: [{ defaultOptionId: null, group: { name: "Salsa", isRequired: false, options: [{ id: "s", name: "Mostaza", recipeLines: [{ ingredientId: "mostaza", quantity: 1 }] }, { id: "q", name: "Queso extra", recipeLines: [{ ingredientId: "queso", quantity: 1 }] }] } }],
    });
    const r = dishAllergens(p, al);
    expect(r.allergens).toEqual(["Gluten", "Huevos", "Lácteos"]);
    expect(r.byOption).toEqual([{ option: "Mostaza", group: "Salsa", extra: ["Mostaza"] }]);
    expect(r.hasData).toBe(true);
  });
  it("avisa de los platos sin datos", () => {
    expect(dishAllergens(dish("x"), al).hasData).toBe(false);
  });
});
