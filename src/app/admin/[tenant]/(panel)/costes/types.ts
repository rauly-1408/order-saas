// Tipos y utilidades de la pantalla de Costes (respuesta de /costs/overview).
import { recipeCostCents, type CostIngredient } from "@/app/lib/costs";

export type BaseUnit = "KG" | "G" | "L" | "ML" | "UNIT";

export type Supplier = { id: string; name: string; contactName: string | null; phone: string | null; email: string | null; notes: string | null };

export type Ingredient = CostIngredient & {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  supplierId: string | null;
  allergens: string[];
};

export type RecipeLine = { ingredientId: string; quantity: number };

export type Option = { id: string; name: string; priceDeltaCents: number; recipeLines: RecipeLine[] };
export type Group = { defaultOptionId: string | null; group: { code: string; name: string; isRequired: boolean; options: Option[] } };
export type Product = { id: string; name: string; basePriceCents: number; recipeLines: RecipeLine[]; modifierGroups: Group[] };
export type Category = { id: string; name: string; products: Product[] };

export type OrderMargin = {
  id: string;
  orderNumber: number | null;
  createdAt: string;
  customerName: string;
  revenueNetCents: number;
  foodCostCents: number;
  platformFeeCents: number;
  marginCents: number;
  complete: boolean;
};

export type Overview = { suppliers: Supplier[]; ingredients: Ingredient[]; categories: Category[]; orders: OrderMargin[] };

export const UNIT_LABEL: Record<BaseUnit, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "ud" };

export { ALLERGENS } from "@/app/lib/costs";

export const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export function linesCost(lines: RecipeLine[], ingredients: Map<string, Ingredient>): number {
  return recipeCostCents(
    lines.flatMap((l) => (ingredients.has(l.ingredientId) ? [{ quantity: l.quantity, ingredient: ingredients.get(l.ingredientId)! }] : []))
  );
}

// Plato "típico": la receta base + la opción que viene por defecto en cada grupo
// obligatorio (pan recomendado, guarnición incluida). Así el margen refleja lo que
// realmente sale de cocina, no solo el relleno.
export function typicalPlate(p: Product) {
  const defaults: Option[] = [];
  for (const g of p.modifierGroups) {
    if (!g.group.isRequired) continue;
    const opt = g.group.options.find((o) => o.id === g.defaultOptionId) ?? g.group.options[0];
    if (opt) defaults.push(opt);
  }
  return {
    priceCents: p.basePriceCents + defaults.reduce((a, o) => a + o.priceDeltaCents, 0),
    lines: [...p.recipeLines, ...defaults.flatMap((o) => o.recipeLines)],
    missing: p.recipeLines.length === 0 ? "receta" : defaults.some((o) => o.recipeLines.length === 0) ? "opciones" : null,
    defaults,
  };
}
