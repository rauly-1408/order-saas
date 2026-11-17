// Informes de Costes: stock en bultos, subidas de precio y alérgenos por plato.
// Funciones puras (sin Prisma ni React) para poder probarlas.
import { ALLERGENS, unitCostCents, type CostIngredient } from "./costs";

type Unit = "KG" | "G" | "L" | "ML" | "UNIT";
const UNIT: Record<Unit, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "ud" };

const num = (v: number, d = 2) => v.toLocaleString("es-ES", { maximumFractionDigits: d });

function qtyText(qty: number, unit: Unit): string {
  if (unit === "G" && qty >= 1000) return `${num(qty / 1000)} kg`;
  if (unit === "ML" && qty >= 1000) return `${num(qty / 1000)} l`;
  return `${num(qty, unit === "UNIT" ? 0 : 2)} ${UNIT[unit]}`;
}

// «≈ 3,5 bultos de 1 kg»: el stock contado en los formatos en que se compra.
// null si no aporta nada (sin formato, formato de una unidad o sin stock).
export function packsText(qty: number, packSize: number, unit: Unit): string | null {
  if (!(packSize > 0) || !(qty > 0)) return null;
  if (unit === "UNIT" && packSize === 1) return null;
  const n = Math.round((qty / packSize) * 10) / 10;
  const word = n === 1 ? "bulto" : "bultos";
  return `≈ ${num(n, 1)} ${word} de ${qtyText(packSize, unit)}`;
}

// ── Subidas de precio ────────────────────────────────────────────────────────

export type ReportIngredient = CostIngredient & {
  id: string;
  name: string;
  baseUnit: Unit;
  isPrep: boolean;
  prepLines: { ingredientId: string; quantity: number }[];
};
export type ReportLine = { ingredientId: string; quantity: number };
export type ReportOption = { id: string; name: string; recipeLines: ReportLine[] };
export type ReportProduct = {
  id: string;
  name: string;
  basePriceCents: number;
  allergens?: string[];
  recipeLines: ReportLine[];
  modifierGroups: { defaultOptionId: string | null; group: { name: string; isRequired: boolean; options: ReportOption[] } }[];
};
export type ReportChange = {
  ingredientId: string;
  oldPackSize: number;
  oldPackPriceCents: number;
  createdAt: string;
};

export type DishImpact = {
  productId: string;
  name: string;
  deltaCents: number; // cuánto más cuesta hacer un plato (receta + opciones por defecto)
  soldLast30: number;
  monthlyCents: number;
};

export type PriceRise = {
  ingredientId: string;
  name: string;
  oldUnitCents: number;
  newUnitCents: number;
  pct: number;
  since: string; // fecha del primer cambio del periodo
  dishes: DishImpact[];
  monthlyCents: number;
};

// Líneas de un plato «tal como sale de cocina»: receta + opción por defecto de los grupos obligatorios.
function typicalLines(p: ReportProduct): ReportLine[] {
  const lines = [...p.recipeLines];
  for (const g of p.modifierGroups) {
    if (!g.group.isRequired) continue;
    const opt = g.group.options.find((o) => o.id === g.defaultOptionId) ?? g.group.options[0];
    if (opt) lines.push(...opt.recipeLines);
  }
  return lines;
}

// Subidas (y bajadas) de precio desde `since`: para cada ingrediente, el precio
// antes del primer cambio del periodo frente al de hoy, y lo que encarece cada
// plato. También cuenta lo que entra a través de una elaboración (la salsa sube
// si sube su aceite).
export function priceRiseReport(
  changes: ReportChange[],
  ingredients: ReportIngredient[],
  products: ReportProduct[],
  soldLast30: Record<string, number>,
  since: Date
): PriceRise[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  // Primer cambio del periodo de cada ingrediente = el precio de antes.
  const first = new Map<string, ReportChange>();
  for (const c of [...changes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (new Date(c.createdAt) < since || first.has(c.ingredientId)) continue;
    first.set(c.ingredientId, c);
  }

  const rises: PriceRise[] = [];
  for (const [id, c] of first) {
    const ing = byId.get(id);
    if (!ing) continue;
    const oldUnit = unitCostCents({ packSize: c.oldPackSize, packPriceCents: c.oldPackPriceCents, wastePct: ing.wastePct });
    const newUnit = unitCostCents(ing);
    if (!(oldUnit > 0) || Math.abs(newUnit - oldUnit) < 1e-9) continue;

    // Cuánto cambia el coste de 1 unidad base de cada ingrediente por culpa de este.
    const memo = new Map<string, number>();
    const delta = (iid: string, depth = 0): number => {
      if (iid === id) return newUnit - oldUnit;
      if (memo.has(iid)) return memo.get(iid)!;
      const x = byId.get(iid);
      let d = 0;
      if (x?.isPrep && x.packSize > 0 && depth < 5) d = x.prepLines.reduce((a, l) => a + l.quantity * delta(l.ingredientId, depth + 1), 0) / x.packSize;
      memo.set(iid, d);
      return d;
    };

    const dishes: DishImpact[] = [];
    for (const p of products) {
      const d = typicalLines(p).reduce((a, l) => a + (l.quantity > 0 ? l.quantity * delta(l.ingredientId) : 0), 0);
      if (Math.abs(d) < 0.005) continue;
      const sold = soldLast30[p.id] ?? 0;
      dishes.push({ productId: p.id, name: p.name, deltaCents: d, soldLast30: sold, monthlyCents: d * sold });
    }
    dishes.sort((a, b) => Math.abs(b.monthlyCents) - Math.abs(a.monthlyCents) || Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
    rises.push({
      ingredientId: id,
      name: ing.name,
      oldUnitCents: oldUnit,
      newUnitCents: newUnit,
      pct: (newUnit / oldUnit - 1) * 100,
      since: c.createdAt,
      dishes,
      monthlyCents: dishes.reduce((a, d) => a + d.monthlyCents, 0),
    });
  }
  // Primero lo que más dinero mueve al mes; luego el mayor porcentaje.
  return rises.sort((a, b) => b.monthlyCents - a.monthlyCents || b.pct - a.pct);
}

// ── Alérgenos por plato ──────────────────────────────────────────────────────

export type DishAllergens = {
  allergens: string[]; // los de la receta + los declarados en Carta, en el orden oficial
  byOption: { option: string; group: string; extra: string[] }[]; // opciones que añaden alguno
  hasData: boolean; // tiene escandallo o alérgenos declarados
};

// Igual que la tienda: alérgenos de la receta + declarados a mano, y aparte los
// que solo añade una opción (pan, salsa…).
export function dishAllergens(p: ReportProduct, ingredientAllergens: Map<string, string[]>): DishAllergens {
  const of = (lines: ReportLine[]) => new Set(lines.flatMap((l) => ingredientAllergens.get(l.ingredientId) ?? []));
  const base = new Set([...of(p.recipeLines), ...(p.allergens ?? [])]);
  const byOption: DishAllergens["byOption"] = [];
  for (const g of p.modifierGroups) {
    for (const o of g.group.options) {
      const extra = ALLERGENS.filter((a) => of(o.recipeLines).has(a) && !base.has(a));
      if (extra.length) byOption.push({ option: o.name, group: g.group.name, extra });
    }
  }
  return {
    allergens: ALLERGENS.filter((a) => base.has(a)),
    byOption,
    hasData: p.recipeLines.length > 0 || (p.allergens?.length ?? 0) > 0,
  };
}
