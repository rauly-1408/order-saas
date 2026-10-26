// Tipos y utilidades de la pantalla de Costes (respuesta de /costs/overview).
import { recipeCostCents, type CostIngredient } from "@/app/lib/costs";

export type BaseUnit = "KG" | "G" | "L" | "ML" | "UNIT";

export type SupplierOrderMethod = "WHATSAPP" | "EMAIL" | "PHONE" | "IN_PERSON";

export type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  extraEmails: string[];
  notes: string | null;
  orderMethod: SupplierOrderMethod;
  deliveryDays: number[];
  leadDays: number;
  orderCutoff: string | null;
  minOrderCents: number | null;
};

export type Ingredient = CostIngredient & {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  supplierId: string | null;
  allergens: string[];
  trackStock: boolean;
  stockQty: number;
  minStock: number | null;
  parStock: number | null;
  // Elaboración (salsa, caldo…): packSize = lo que rinde el lote y packPriceCents = su coste.
  isPrep: boolean;
  // Consumible (packaging, limpieza…): apartado propio y gasto por pedido.
  kind: "FOOD" | "CONSUMABLE";
  category: string | null;
  perOrderQty: number | null;
  perOrderChannels: string[];
  perItemQty: number | null;
  perItemCategoryIds: string[];
  prepExtras: { label: string; cents: number }[];
  prepNotes: string | null;
  prepLines: RecipeLine[];
};

export type RecipeLine = { ingredientId: string; quantity: number };

export type Option = { id: string; name: string; priceDeltaCents: number; stockOut: boolean; recipeLines: RecipeLine[] };
export type Group = { defaultOptionId: string | null; group: { code: string; name: string; isRequired: boolean; options: Option[] } };
export type Product = {
  id: string;
  name: string;
  basePriceCents: number;
  isAvailable: boolean;
  stockOut: boolean;
  recipeLines: RecipeLine[];
  modifierGroups: Group[];
};
export type Category = { id: string; name: string; products: Product[] };

export type OrderMargin = {
  id: string;
  orderNumber: number | null;
  createdAt: string;
  customerName: string;
  revenueNetCents: number;
  foodCostCents: number;
  consumablesCents: number;
  platformFeeCents: number;
  marginCents: number;
  complete: boolean;
};

export type MovementType = "ORDER" | "ORDER_CANCEL" | "RECEIPT" | "COUNT" | "WASTE" | "PRODUCTION" | "USE";

export type Movement = {
  id: string;
  ingredientId: string;
  type: MovementType;
  quantity: number;
  stockAfter: number;
  valueCents: number;
  orderId: string | null;
  note: string | null;
  createdAt: string;
};

export type PurchaseStatus = "DRAFT" | "SENT" | "RECEIVED" | "CANCELLED";

export type PurchaseOrder = {
  id: string;
  supplierId: string;
  number: number;
  status: PurchaseStatus;
  notes: string | null;
  sentAt: string | null;
  expectedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  lines: { id: string; ingredientId: string; quantity: number; packPriceCents: number; receivedQuantity: number | null }[];
};

export type PriceChange = {
  id: string;
  ingredientId: string;
  oldPackSize: number;
  oldPackPriceCents: number;
  newPackSize: number;
  newPackPriceCents: number;
  source: "MANUAL" | "RECEIPT";
  createdAt: string;
};

export type BatchYield = { perBatch: number; count: number; min: number; max: number };

export type PeriodSum = { orders: number; items: number; revenueNetCents: number; marginCents: number; complete: boolean };

export type Overview = {
  costSettings: import("@/app/lib/pricing").CostSettings;
  period: { last30: PeriodSum; month: PeriodSum & { daysElapsed: number; daysInMonth: number } };
  yields: Record<string, BatchYield | null>;
  restaurantName: string;
  aiEnabled: boolean;
  purchaseOrders: PurchaseOrder[];
  priceChanges: PriceChange[];
  suppliers: Supplier[];
  ingredients: Ingredient[];
  categories: Category[];
  orders: OrderMargin[];
  movements: Movement[];
};

// Cantidad legible: 1250 g → "1,25 kg"; 3 ud → "3 ud".
export function formatQty(qty: number, unit: BaseUnit): string {
  const n = (v: number, d = 2) => v.toLocaleString("es-ES", { maximumFractionDigits: d });
  if (unit === "G" && Math.abs(qty) >= 1000) return `${n(qty / 1000)} kg`;
  if (unit === "ML" && Math.abs(qty) >= 1000) return `${n(qty / 1000)} l`;
  return `${n(qty, unit === "UNIT" ? 0 : 2)} ${UNIT_LABEL[unit]}`;
}

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
