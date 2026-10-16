// Albaranes de proveedor (módulo Costes, fase 4): tipos y funciones puras que
// usan tanto el servidor como el panel. La llamada a la IA está en invoiceScan.ts.
import type { BaseUnit } from "@prisma/client";

export const SCAN_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type ScanMediaType = (typeof SCAN_MEDIA_TYPES)[number];

export type ScanIngredient = { id: string; name: string; baseUnit: BaseUnit; packSize: number; packPriceCents: number; supplierId: string | null };
export type ScanSupplier = { id: string; name: string };

export type ScanLine = {
  description: string;
  ingredientId: string | null;
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
    const quantity = numOrNull(x.quantity);
    const price = numOrNull(x.packPriceCents);
    const total = numOrNull(x.lineTotalCents);
    return [
      {
        description: description.slice(0, 200),
        ingredientId,
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

// ¿Cantidad × precio cuadra con el importe de la línea? (tolerancia 5 %)
export function lineMismatch(l: { quantity: number | null; packPriceCents: number | null; lineTotalCents: number | null }, packSize: number): boolean {
  if (l.quantity == null || l.packPriceCents == null || l.lineTotalCents == null || !(packSize > 0) || l.lineTotalCents <= 0) return false;
  const computed = (l.quantity / packSize) * l.packPriceCents;
  return Math.abs(computed - l.lineTotalCents) / l.lineTotalCents > 0.05;
}
