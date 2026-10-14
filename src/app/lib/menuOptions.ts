// Opciones de producto (pan, guarnición, extras): tipos compartidos entre la
// API del menú, el selector del cliente, la API de pedidos y el panel admin.

export type MenuModifierOption = {
  id: string;
  name: string;
  priceDeltaCents: number;
  allergens?: string[]; // del escandallo de la opción (módulo Costes)
};

export type MenuModifierGroup = {
  id: string;
  code: string;
  name: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  defaultOptionId: string | null;
  options: MenuModifierOption[];
};

// Snapshot guardado en OrderLine.modifiers (JSON). Se guarda el nombre y el
// precio del momento del pedido: si mañana cambia la carta, el pedido no cambia.
export type OrderLineModifier = {
  groupCode: string;
  group: string;
  option: string;
  priceDeltaCents: number;
};

// Texto corto para cocina / resumen del cliente.
export function formatModifier(m: Pick<OrderLineModifier, "groupCode" | "option">): string {
  if (m.groupCode === "BREAD") return `Pan ${m.option.charAt(0).toLowerCase()}${m.option.slice(1)}`;
  if (m.groupCode === "SIDE") return m.option;
  return `+ ${m.option}`;
}

// Extrae las etiquetas de un snapshot JSON. Acepta el formato actual
// (OrderLineModifier[]) y el antiguo ({ bread, side, sidePriceCents }).
export function modifierLabels(modifiers: unknown): string[] {
  const list = Array.isArray(modifiers) ? modifiers : modifiers ? [modifiers] : [];
  const labels: string[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.option === "string" && typeof e.groupCode === "string") {
      labels.push(formatModifier({ groupCode: e.groupCode, option: e.option }));
      continue;
    }
    if (typeof e.bread === "string" && e.bread.trim()) labels.push(formatModifier({ groupCode: "BREAD", option: e.bread.trim() }));
    if (typeof e.side === "string" && e.side.trim()) labels.push(e.side.trim());
  }
  return labels;
}

// Selección inicial: la opción por defecto del producto (p. ej. su pan
// recomendado) o, si el grupo es obligatorio de una sola opción, la primera.
export function initialSelection(groups: MenuModifierGroup[]): Record<string, string[]> {
  const sel: Record<string, string[]> = {};
  for (const g of groups) {
    if (g.defaultOptionId && g.options.some((o) => o.id === g.defaultOptionId)) sel[g.id] = [g.defaultOptionId];
    else if (g.isRequired && g.maxSelect === 1 && g.options[0]) sel[g.id] = [g.options[0].id];
    else sel[g.id] = [];
  }
  return sel;
}

// Valida una selección contra los grupos del producto. Devuelve el mensaje de
// error para el usuario, o null si es válida.
export function validateSelection(groups: MenuModifierGroup[], sel: Record<string, string[]>): string | null {
  for (const g of groups) {
    const chosen = sel[g.id] ?? [];
    const min = g.isRequired ? Math.max(1, g.minSelect) : g.minSelect;
    if (chosen.length < min) return `${g.name}: elige una opción`;
    if (chosen.length > g.maxSelect) return `${g.name}: máximo ${g.maxSelect}`;
    if (chosen.some((id) => !g.options.some((o) => o.id === id))) return `${g.name}: opción no válida`;
  }
  return null;
}

// Convierte una selección en snapshot ordenado como la carta (grupo, opción).
export function selectionToModifiers(groups: MenuModifierGroup[], sel: Record<string, string[]>): OrderLineModifier[] {
  const out: OrderLineModifier[] = [];
  for (const g of groups) {
    const chosen = new Set(sel[g.id] ?? []);
    for (const o of g.options) {
      if (chosen.has(o.id)) out.push({ groupCode: g.code, group: g.name, option: o.name, priceDeltaCents: o.priceDeltaCents });
    }
  }
  return out;
}
