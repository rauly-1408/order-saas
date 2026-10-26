// Cómo pone sus precios cada restaurante (Costes → Rentabilidad) y su punto de
// equilibrio. Se guarda en Tenant.settings.costs. Funciones puras: cliente,
// servidor y tests. Ver docs/MODULO-COSTES.md
//
// - FOOD_COST: precio para que el coste sea un % del precio sin IVA (lo de siempre).
// - MARKUP: recargo sobre el coste, como en la hoja de Ana María: PVP = coste × 1,60
//   (con IVA incluido). Las elaboraciones del obrador pueden llegar al local con su
//   propio recargo (coste del lote + 30 %).

export type PriceMode = "FOOD_COST" | "MARKUP";
export type FixedCost = { label: string; cents: number }; // al mes

export type CostSettings = {
  priceMode: PriceMode;
  targetFoodCostPct: number;
  markupPct: number; // recargo del local sobre el coste
  prepMarkupPct: number; // recargo de las elaboraciones (obrador → local); 0 = a coste
  fixedCosts: FixedCost[];
  openDaysPerMonth: number;
};

export const DEFAULT_COST_SETTINGS: CostSettings = {
  priceMode: "FOOD_COST",
  targetFoodCostPct: 30,
  markupPct: 60,
  prepMarkupPct: 0,
  fixedCosts: [],
  openDaysPerMonth: 26,
};

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// Lee (y sanea) lo guardado; lo que falte o no valga toma el valor por defecto.
export function costSettingsOf(settings: unknown): CostSettings {
  const raw = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).costs : null) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COST_SETTINGS, fixedCosts: [] };
  const d = DEFAULT_COST_SETTINGS;
  const fixed = Array.isArray(raw.fixedCosts) ? raw.fixedCosts : [];
  return {
    priceMode: raw.priceMode === "MARKUP" ? "MARKUP" : "FOOD_COST",
    targetFoodCostPct: clamp(raw.targetFoodCostPct, 5, 80, d.targetFoodCostPct),
    markupPct: clamp(raw.markupPct, 0, 1000, d.markupPct),
    prepMarkupPct: clamp(raw.prepMarkupPct, 0, 300, d.prepMarkupPct),
    fixedCosts: fixed
      .flatMap((f) => {
        const o = f as Record<string, unknown>;
        const label = typeof o?.label === "string" ? o.label.trim().slice(0, 60) : "";
        const cents = Math.round(Number(o?.cents));
        return label && cents >= 0 && cents <= 100_000_000 ? [{ label, cents }] : [];
      })
      .slice(0, 40),
    openDaysPerMonth: Math.round(clamp(raw.openDaysPerMonth, 1, 31, d.openDaysPerMonth)),
  };
}

const up5 = (cents: number) => Math.ceil(cents / 5 - 1e-9) * 5;

// Precio de carta (con IVA) con un recargo sobre el coste: 3,00 € × 1,60 = 4,80 €.
export function markupPriceCents(costCents: number, markupPct: number): number {
  if (!(costCents > 0)) return 0;
  return up5(costCents * (1 + markupPct / 100));
}

// Coste de un ingrediente para el local: las elaboraciones llevan el recargo del obrador.
export function withPrepMarkup<T extends { isPrep: boolean; packPriceCents: number }>(ingredients: T[], prepMarkupPct: number): T[] {
  if (!(prepMarkupPct > 0)) return ingredients;
  return ingredients.map((i) => (i.isPrep ? { ...i, packPriceCents: i.packPriceCents * (1 + prepMarkupPct / 100) } : i));
}

export const fixedMonthlyCents = (s: Pick<CostSettings, "fixedCosts">) => s.fixedCosts.reduce((a, f) => a + f.cents, 0);

// Punto de equilibrio: cuánto hay que ganar al día (margen, ya sin ingredientes,
// packaging ni comisiones) para pagar los gastos fijos, y cuántos productos son
// con el margen medio por producto vendido.
export function breakEven(fixedCents: number, openDays: number, marginPerItemCents: number | null): { perDayCents: number; itemsPerDay: number | null } {
  const perDayCents = openDays > 0 ? fixedCents / openDays : 0;
  const itemsPerDay = marginPerItemCents != null && marginPerItemCents > 0 ? Math.ceil(perDayCents / marginPerItemCents - 1e-9) : null;
  return { perDayCents, itemsPerDay };
}
