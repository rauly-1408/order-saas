// Albaranes de proveedor (módulo Costes, fase 4): tipos y funciones puras que
// usan tanto el servidor como el panel. La llamada a la IA está en invoiceScan.ts.
import type { BaseUnit } from "@prisma/client";
import { normalizeAllergens } from "@/app/lib/costs";

const BASE_UNITS: BaseUnit[] = ["KG", "G", "L", "ML", "UNIT"];

export const SCAN_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type ScanMediaType = (typeof SCAN_MEDIA_TYPES)[number];

export type ScanIngredient = { id: string; name: string; baseUnit: BaseUnit; packSize: number; packPriceCents: number; supplierId: string | null };
export type ScanSupplier = { id: string; name: string };

// Propuesta de ingrediente nuevo para una línea que no corresponde a ninguno de la lista.
export type ScanNewIngredient = {
  name: string;
  baseUnit: BaseUnit;
  packSize: number; // formato de compra en la unidad base (caja de 5 kg con base g → 5000)
  packPriceCents: number; // precio sin IVA de UN formato
  allergens: string[];
};

export type ScanLine = {
  description: string;
  ingredientId: string | null;
  newIngredient: ScanNewIngredient | null; // solo cuando ingredientId es null
  quantity: number | null; // en la unidad base del ingrediente
  packPriceCents: number | null; // precio sin IVA de UN formato del ingrediente
  lineTotalCents: number | null; // importe sin IVA de la línea, tal cual en el documento
  note: string | null;
};

export type ScanResult = {
  supplierId: string | null;
  supplierName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  totalCents: number | null;
  lines: ScanLine[];
};

const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

// Limpia la respuesta: ids que no existen → null, números negativos → null.
export function sanitizeScan(raw: unknown, ingredients: ScanIngredient[], suppliers: ScanSupplier[]): ScanResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ingIds = new Set(ingredients.map((i) => i.id));
  const supIds = new Set(suppliers.map((s) => s.id));
  const lines = (Array.isArray(r.lines) ? r.lines : []).flatMap((l): ScanLine[] => {
    const x = (l ?? {}) as Record<string, unknown>;
    const description = strOrNull(x.description);
    if (!description) return [];
    const ingredientId = typeof x.ingredientId === "string" && ingIds.has(x.ingredientId) ? x.ingredientId : null;
    const newIngredient = ingredientId ? null : sanitizeNewIngredient(x.newIngredient);
    const quantity = numOrNull(x.quantity);
    const price = numOrNull(x.packPriceCents);
    const total = numOrNull(x.lineTotalCents);
    return [
      {
        description: description.slice(0, 200),
        ingredientId,
        newIngredient,
        quantity: quantity != null && quantity > 0 ? quantity : null,
        packPriceCents: price != null && price >= 0 ? Math.round(price) : null,
        lineTotalCents: total != null ? Math.round(total) : null,
        note: strOrNull(x.note)?.slice(0, 200) ?? null,
      },
    ];
  });
  const total = numOrNull(r.totalCents);
  return {
    supplierId: typeof r.supplierId === "string" && supIds.has(r.supplierId) ? r.supplierId : null,
    supplierName: strOrNull(r.supplierName),
    documentNumber: strOrNull(r.documentNumber)?.slice(0, 60) ?? null,
    documentDate: strOrNull(r.documentDate),
    totalCents: total != null ? Math.round(total) : null,
    lines,
  };
}

function sanitizeNewIngredient(raw: unknown): ScanNewIngredient | null {
  const n = (raw ?? null) as Record<string, unknown> | null;
  if (!n || typeof n !== "object") return null;
  const name = strOrNull(n.name)?.slice(0, 80);
  const baseUnit = typeof n.baseUnit === "string" && BASE_UNITS.includes(n.baseUnit as BaseUnit) ? (n.baseUnit as BaseUnit) : null;
  const packSize = numOrNull(n.packSize);
  const price = numOrNull(n.packPriceCents);
  if (!name || !baseUnit || packSize == null || packSize <= 0 || price == null || price < 0) return null;
  return { name, baseUnit, packSize, packPriceCents: Math.round(price), allergens: normalizeAllergens(Array.isArray(n.allergens) ? n.allergens.map(String) : []) };
}

// ¿Cantidad × precio cuadra con el importe de la línea? (tolerancia 5 %)
export function lineMismatch(l: { quantity: number | null; packPriceCents: number | null; lineTotalCents: number | null }, packSize: number): boolean {
  if (l.quantity == null || l.packPriceCents == null || l.lineTotalCents == null || !(packSize > 0) || l.lineTotalCents <= 0) return false;
  const computed = (l.quantity / packSize) * l.packPriceCents;
  return Math.abs(computed - l.lineTotalCents) / l.lineTotalCents > 0.05;
}
