// Cómo pone sus precios cada restaurante (Costes → Rentabilidad) y su punto de
// equilibrio. Se guarda en Tenant.settings.costs. Funciones puras: cliente,
// servidor y tests. Ver docs/MODULO-COSTES.md
//
// Cada restaurante lo pone a su manera:
// - FOOD_COST: el coste es un % del precio sin IVA (30 % por defecto).
// - MARGIN: lo que te queda es un % del precio sin IVA (lo contrario del food cost).
// - MARKUP: recargo sobre el coste: precio = coste × 1,60. El precio que sale puede
//   llevar ya el IVA (como en la hoja de Ana María, Estafetén) o no (se suma después).
// Las elaboraciones del obrador pueden llegar al local con su propio recargo
// (coste del lote + 30 %).

export type PriceMode = "FOOD_COST" | "MARGIN" | "MARKUP";
export type FixedCost = { label: string; cents: number }; // al mes

export type CostSettings = {
  priceMode: PriceMode;
  targetFoodCostPct: number;
  targetMarginPct: number; // lo que te queda, % del precio sin IVA
  markupPct: number; // recargo del local sobre el coste
  markupIncludesVat: boolean; // el precio con recargo ya lleva el IVA
  prepMarkupPct: number; // recargo de las elaboraciones (obrador → local); 0 = a coste
  fixedCosts: FixedCost[];
  openDaysPerMonth: number;
};

export const DEFAULT_COST_SETTINGS: CostSettings = {
  priceMode: "FOOD_COST",
  targetFoodCostPct: 30,
  targetMarginPct: 70,
  markupPct: 60,
  markupIncludesVat: true,
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
    priceMode: raw.priceMode === "MARKUP" || raw.priceMode === "MARGIN" ? raw.priceMode : "FOOD_COST",
    targetFoodCostPct: clamp(raw.targetFoodCostPct, 5, 80, d.targetFoodCostPct),
    targetMarginPct: clamp(raw.targetMarginPct, 5, 95, d.targetMarginPct),
    markupPct: clamp(raw.markupPct, 0, 1000, d.markupPct),
    markupIncludesVat: typeof raw.markupIncludesVat === "boolean" ? raw.markupIncludesVat : d.markupIncludesVat,
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

export type DishVerdict = {
  netCents: number; // precio sin IVA
  vatCents: number;
  profitCents: number; // lo que te queda por plato (sin IVA, menos el coste)
  markupPct: number | null; // recargo real sobre el coste
  foodCostPct: number | null; // coste ÷ precio sin IVA
  marginPct: number | null; // lo que te queda ÷ precio sin IVA
  meets: boolean | null; // llega a tu objetivo (null = sin coste o sin precio)
  targetPriceCents: number; // precio de carta (con IVA) con el que llegarías justo a tu objetivo
};

type VerdictSettings = Pick<CostSettings, "priceMode" | "markupPct" | "markupIncludesVat" | "targetFoodCostPct" | "targetMarginPct">;

// Lo que hay que saber de un plato, en el idioma de cada restaurante.
export function dishVerdict(costCents: number, priceGrossCents: number, s: VerdictSettings, vatPct = 10): DishVerdict {
  const vat = 1 + vatPct / 100;
  const netCents = priceGrossCents / vat;
  const ok = costCents > 0 && priceGrossCents > 0;
  // El recargo se mide sobre el precio con o sin IVA, como lo calcule el restaurante.
  const markupBase = s.markupIncludesVat ? priceGrossCents : netCents;
  const markupPct = ok ? (markupBase / costCents - 1) * 100 : null;
  const foodCostPct = ok ? (costCents / netCents) * 100 : null;
  const marginPct = ok ? 100 - foodCostPct! : null;
  const meets = !ok
    ? null
    : s.priceMode === "MARKUP"
      ? markupPct! >= s.markupPct - 0.5
      : s.priceMode === "MARGIN"
        ? marginPct! >= s.targetMarginPct - 0.5
        : foodCostPct! <= s.targetFoodCostPct + 0.5;
  const targetPriceCents = !(costCents > 0)
    ? 0
    : s.priceMode === "MARKUP"
      ? up5(costCents * (1 + s.markupPct / 100) * (s.markupIncludesVat ? 1 : vat))
      : up5((costCents / ((s.priceMode === "MARGIN" ? 100 - s.targetMarginPct : s.targetFoodCostPct) / 100)) * vat);
  return { netCents, vatCents: priceGrossCents - netCents, profitCents: netCents - costCents, markupPct, foodCostPct, marginPct, meets, targetPriceCents };
}
