// Consumibles (módulo Costes): cuánto se gasta de cada uno en un pedido según su
// tipo. Funciones puras: las usan el servidor (inventario) y el panel.
// Ver docs/MODULO-COSTES.md

export type OrderKind = "DELIVERY" | "TAKEAWAY" | "HERE";
export const orderKindOf = (channel: string, dineIn: boolean): OrderKind => (channel === "DELIVERY" ? "DELIVERY" : dineIn ? "HERE" : "TAKEAWAY");
export const appliesTo = (channels: string[], kind: OrderKind) => channels.length === 0 || channels.includes(kind);

// Cuánto se gasta de cada consumible en un pedido: lo fijo por pedido (la bolsa)
// + lo que va por cada producto de ciertas categorías (caja y envoltorio por mollete).
export type ConsumableRule = { perOrderQty: number | null; perOrderChannels: string[]; perItemQty: number | null; perItemCategoryIds: string[] };
export function consumableQty(c: ConsumableRule, kind: OrderKind, unitsByCategory: Map<string, number>): number {
  if (!appliesTo(c.perOrderChannels, kind)) return 0;
  const items = (c.perItemQty ?? 0) > 0 ? c.perItemCategoryIds.reduce((a, id) => a + (unitsByCategory.get(id) ?? 0), 0) * c.perItemQty! : 0;
  return (c.perOrderQty ?? 0) + items;
}

