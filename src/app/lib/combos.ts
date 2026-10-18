// Combos / menús a precio cerrado. Funciones puras compartidas por la carta
// (selector del cliente), la API de pedidos (que es quien manda) y el panel.
// Ver docs/COMBOS.md
import { modifierLabels, selectionToModifiers, validateSelection, type MenuModifierGroup, type OrderLineModifier } from "@/app/lib/menuOptions";

// required false = paso opcional (p. ej. «Complementos»): se puede dejar sin elegir.
export type ComboSlotDef = { id: string; name: string; required?: boolean; items: { productId: string; extraCents: number }[] };
export type ComboChoice = { slotId: string; productId: string; optionIds: string[] };
export type ChoiceProduct = { id: string; name: string; modifierGroups: MenuModifierGroup[] };

export const COMBO_GROUP_CODE = "COMBO";

// Clave estable de una línea de combo en el carrito: el mismo menú con otras
// elecciones es otra línea.
export function comboChoicesKey(choices: ComboChoice[]): string {
  return [...choices]
    .sort((a, b) => a.slotId.localeCompare(b.slotId))
    .map((c) => `${c.slotId}=${c.productId}(${[...c.optionIds].sort().join(",")})`)
    .join("|");
}

// Agrupa las opciones elegidas de un producto por grupo (para validarlas).
export function selectionFromOptionIds(groups: MenuModifierGroup[], optionIds: string[]): Record<string, string[]> | string {
  const sel: Record<string, string[]> = Object.fromEntries(groups.map((g) => [g.id, []]));
  for (const id of new Set(optionIds)) {
    const g = groups.find((x) => x.options.some((o) => o.id === id));
    if (!g) return "opción no válida";
    sel[g.id].push(id);
  }
  return sel;
}

export type PricedCombo = { unitCents: number; modifiers: OrderLineModifier[] };

// Valida las elecciones (una por hueco, de su lista, con opciones válidas) y
// devuelve el precio por unidad y el resumen para cocina, o el error.
export function priceCombo(
  combo: { name: string; basePriceCents: number; slots: ComboSlotDef[] },
  choices: ComboChoice[],
  productById: Map<string, ChoiceProduct>
): PricedCombo | string {
  if (choices.some((c) => !combo.slots.some((s) => s.id === c.slotId))) return `${combo.name}: elige una opción en cada paso`;
  let unitCents = combo.basePriceCents;
  const modifiers: OrderLineModifier[] = [];
  for (const slot of combo.slots) {
    const picks = choices.filter((c) => c.slotId === slot.id);
    if (picks.length === 0 && slot.required === false) continue; // paso opcional sin elegir
    if (picks.length !== 1) return `${combo.name} — ${slot.name}: elige una opción`;
    const pick = picks[0];
    const item = slot.items.find((i) => i.productId === pick.productId);
    const product = productById.get(pick.productId);
    if (!item || !product) return `${combo.name} — ${slot.name}: esa opción ya no está disponible`;
    const sel = selectionFromOptionIds(product.modifierGroups, pick.optionIds);
    if (typeof sel === "string") return `${product.name}: ${sel}`;
    const err = validateSelection(product.modifierGroups, sel);
    if (err) return `${product.name} — ${err}`;
    const mods = selectionToModifiers(product.modifierGroups, sel);
    const delta = item.extraCents + mods.reduce((a, m) => a + m.priceDeltaCents, 0);
    unitCents += delta;
    const detail = modifierLabels(mods);
    modifiers.push({
      groupCode: COMBO_GROUP_CODE,
      group: slot.name,
      option: detail.length ? `${product.name} (${detail.join(", ")})` : product.name,
      priceDeltaCents: delta,
    });
  }
  return { unitCents, modifiers };
}
