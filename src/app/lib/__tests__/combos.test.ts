import { describe, expect, it } from "vitest";
import { comboChoicesKey, priceCombo, type ChoiceProduct, type ComboSlotDef } from "@/app/lib/combos";
import type { MenuModifierGroup } from "@/app/lib/menuOptions";

// Menú mollete: mollete (obligatorio) + complementos (opcional) + bebida (obligatoria).
const salsa: MenuModifierGroup = {
  id: "g-salsa",
  code: "SALSA",
  name: "Salsa",
  isRequired: false,
  minSelect: 0,
  maxSelect: 2,
  defaultOptionId: null,
  options: [
    { id: "o-ali", name: "Alioli", priceDeltaCents: 0 },
    { id: "o-trufa", name: "Trufa", priceDeltaCents: 50 },
  ],
};
const products = new Map<string, ChoiceProduct>([
  ["p-genil", { id: "p-genil", name: "Genil", modifierGroups: [salsa] }],
  ["p-patatas", { id: "p-patatas", name: "Patatas", modifierGroups: [] }],
  ["p-cola", { id: "p-cola", name: "Cola", modifierGroups: [] }],
]);
const slots: ComboSlotDef[] = [
  { id: "s-mollete", name: "Elige tu mollete", items: [{ productId: "p-genil", extraCents: 0 }] },
  { id: "s-compl", name: "Complementos", required: false, items: [{ productId: "p-patatas", extraCents: 395 }] },
  { id: "s-bebida", name: "Elige tu bebida", items: [{ productId: "p-cola", extraCents: 0 }] },
];
const combo = { name: "Menú mollete", basePriceCents: 1250, slots };

describe("priceCombo", () => {
  it("cobra el precio cerrado cuando no hay suplementos", () => {
    const r = priceCombo(combo, [{ slotId: "s-mollete", productId: "p-genil", optionIds: [] }, { slotId: "s-bebida", productId: "p-cola", optionIds: [] }], products);
    expect(r).toMatchObject({ unitCents: 1250 });
    expect((r as { modifiers: unknown[] }).modifiers).toHaveLength(2);
  });

  it("suma el suplemento del paso opcional y el extra de la opción", () => {
    const r = priceCombo(
      combo,
      [
        { slotId: "s-mollete", productId: "p-genil", optionIds: ["o-trufa"] },
        { slotId: "s-compl", productId: "p-patatas", optionIds: [] },
        { slotId: "s-bebida", productId: "p-cola", optionIds: [] },
      ],
      products
    );
    expect(r).toMatchObject({ unitCents: 1250 + 50 + 395 });
    const mods = (r as { modifiers: { option: string; priceDeltaCents: number }[] }).modifiers;
    expect(mods[0].option).toMatch(/^Genil \(.*Trufa.*\)$/);
    expect(mods[1].priceDeltaCents).toBe(395);
  });

  it("rechaza un menú sin la bebida (paso obligatorio)", () => {
    const r = priceCombo(combo, [{ slotId: "s-mollete", productId: "p-genil", optionIds: [] }], products);
    expect(typeof r).toBe("string");
    expect(r).toContain("Elige tu bebida");
  });

  it("rechaza un producto que no está en la lista del paso", () => {
    const r = priceCombo(combo, [{ slotId: "s-mollete", productId: "p-cola", optionIds: [] }, { slotId: "s-bebida", productId: "p-cola", optionIds: [] }], products);
    expect(r).toContain("ya no está disponible");
  });

  it("rechaza más opciones de las permitidas", () => {
    const r = priceCombo(
      combo,
      [{ slotId: "s-mollete", productId: "p-genil", optionIds: ["o-ali", "o-trufa", "o-x"] }, { slotId: "s-bebida", productId: "p-cola", optionIds: [] }],
      products
    );
    expect(typeof r).toBe("string");
  });
});

describe("comboChoicesKey", () => {
  it("no depende del orden de los pasos ni de las opciones", () => {
    const a = comboChoicesKey([{ slotId: "b", productId: "p", optionIds: ["2", "1"] }, { slotId: "a", productId: "q", optionIds: [] }]);
    const b = comboChoicesKey([{ slotId: "a", productId: "q", optionIds: [] }, { slotId: "b", productId: "p", optionIds: ["1", "2"] }]);
    expect(a).toBe(b);
  });
});
