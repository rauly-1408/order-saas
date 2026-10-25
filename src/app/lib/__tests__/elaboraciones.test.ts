import { describe, expect, it } from "vitest";
import { cleanExtras, createsCycle, prepCost } from "../preps";

// Elaboraciones: coste del lote ÷ lo que rinde. Ejemplo: boloñesa con 50 kg de
// carne que rinde 60 kg.
const ing = (eurPerKg: number, wastePct = 0) => ({ packSize: 1000, packPriceCents: eurPerKg * 100, wastePct });

describe("Elaboraciones · coste por lotes", () => {
  it("suma ingredientes y otros costes y lo reparte entre lo que rinde", () => {
    const c = prepCost(
      [
        { quantity: 50_000, ingredient: ing(6) }, // 50 kg de carne a 6 €/kg = 300 €
        { quantity: 5_000, ingredient: ing(2) }, // 5 kg de tomate frito = 10 €
        { quantity: 250, ingredient: ing(12) }, // 250 g de pimienta = 3 €
      ],
      [
        { label: "Mano de obra", cents: 4_000 },
        { label: "Horno / energía", cents: 1_000 },
      ],
      60_000 // rinde 60 kg (en g)
    );
    expect(c.ingredientsCents).toBe(31_300);
    expect(c.extrasCents).toBe(5_000);
    expect(c.totalCents).toBe(36_300);
    expect(Math.round(c.perUnitCents * 1000)).toBe(605); // 6,05 €/kg
    expect(Math.round(c.perUnitCents * 130)).toBe(79); // ración de 130 g ≈ 0,79 €
  });
  it("la merma del ingrediente encarece", () => {
    const c = prepCost([{ quantity: 900, ingredient: ing(1, 10) }], [], 900);
    expect(Math.round(c.totalCents)).toBe(100); // 900 g útiles de tomate con 10 % de merma = 1 kg comprado
  });
  it("no deja meter una elaboración dentro de otra que ya la lleva", () => {
    const linesOf = new Map([
      ["jamon", ["caldo", "cerdo"]],
      ["caldo", ["agua", "huesos"]],
    ]);
    expect(createsCycle("caldo", "jamon", linesOf)).toBe(true);
    expect(createsCycle("jamon", "caldo", linesOf)).toBe(false);
  });
  it("limpia los otros costes", () => {
    expect(cleanExtras([{ label: " Maquila ", cents: 30 }, { label: "", cents: 5 }, { label: "Malo", cents: -1 }])).toEqual([{ label: "Maquila", cents: 30 }]);
  });
});
