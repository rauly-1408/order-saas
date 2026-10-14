// Cálculo de costes y márgenes del módulo "Costes y Margen".
// Funciones puras (sin Prisma) para poder usarlas en API, servidor y pruebas.
// Importes en céntimos; los costes intermedios se mantienen con decimales y se
// redondean solo al presentar.

// Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011).
export const ALLERGENS = [
  "Gluten", "Crustáceos", "Huevos", "Pescado", "Cacahuetes", "Soja", "Lácteos",
  "Frutos de cáscara", "Apio", "Mostaza", "Sésamo", "Sulfitos", "Altramuces", "Moluscos",
];

// Normaliza a la lista oficial ("gluten" → "Gluten"); descarta lo que no sea uno de los 14.
export function normalizeAllergens(values: string[]): string[] {
  const byKey = new Map(ALLERGENS.map((a) => [a.toLowerCase(), a]));
  return [...new Set(values.map((v) => byKey.get(v.trim().toLowerCase())).filter((a): a is string => !!a))];
}

export type CostIngredient = {
  packSize: number; // en unidad base (g, ml, unidades…)
  packPriceCents: number;
  wastePct: number; // 0-99
};

export type CostLine = { quantity: number; ingredient: CostIngredient };

// Coste por unidad base, encarecido por la merma: si se pierde un 20 % al limpiar,
// cada gramo útil cuesta 1 / 0,8 veces más.
export function unitCostCents(ing: CostIngredient): number {
  if (!(ing.packSize > 0) || !(ing.packPriceCents >= 0)) return 0;
  const waste = Math.min(Math.max(ing.wastePct || 0, 0), 99);
  return ing.packPriceCents / ing.packSize / (1 - waste / 100);
}

export function recipeCostCents(lines: CostLine[]): number {
  return lines.reduce((acc, l) => acc + (l.quantity > 0 ? l.quantity * unitCostCents(l.ingredient) : 0), 0);
}

export type Margin = {
  costCents: number;
  priceCents: number;
  marginCents: number;
  marginPct: number | null; // sobre precio de venta
  foodCostPct: number | null; // coste / precio
};

// Precios de carta en España incluyen IVA (10 % en hostelería). El margen se
// calcula sobre el precio SIN IVA para no inflarlo.
export const DEFAULT_VAT_PCT = 10;

export function netOfVat(priceCents: number, vatPct = DEFAULT_VAT_PCT): number {
  return priceCents / (1 + vatPct / 100);
}

export function margin(costCents: number, grossPriceCents: number, vatPct = DEFAULT_VAT_PCT): Margin {
  const priceCents = netOfVat(grossPriceCents, vatPct);
  const marginCents = priceCents - costCents;
  return {
    costCents,
    priceCents,
    marginCents,
    marginPct: priceCents > 0 ? (marginCents / priceCents) * 100 : null,
    foodCostPct: priceCents > 0 ? (costCents / priceCents) * 100 : null,
  };
}

export type Health = "good" | "warn" | "bad" | "unknown";

// Semáforo por food cost: objetivo habitual en hostelería 25-35 %.
export function foodCostHealth(foodCostPct: number | null, targetPct = 30): Health {
  if (foodCostPct == null) return "unknown";
  if (foodCostPct <= targetPct) return "good";
  if (foodCostPct <= targetPct + 10) return "warn";
  return "bad";
}

// Precio de carta (con IVA) necesario para alcanzar un food cost objetivo.
export function suggestedGrossPriceCents(costCents: number, targetFoodCostPct = 30, vatPct = DEFAULT_VAT_PCT): number {
  if (!(targetFoodCostPct > 0) || !(costCents > 0)) return 0;
  const exact = (costCents / (targetFoodCostPct / 100)) * (1 + vatPct / 100);
  // Redondeo hacia arriba a 5 céntimos; el epsilon evita que 935,0000001 (coma flotante) suba a 940.
  return Math.ceil(exact / 5 - 1e-9) * 5;
}
