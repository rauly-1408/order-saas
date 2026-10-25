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

// INGREDIENT: comida o bebida que entra en cocina. EXPENSE: lo demás que se
// paga en la misma factura (limpieza, bolsas, parking, menaje…): cuenta para el
// total y el IVA pero no entra al stock.
export type LineKind = "INGREDIENT" | "EXPENSE";

export type ScanLine = {
  description: string;
  kind: LineKind;
  // Tal como aparece en el documento (lo que el dueño reconoce):
  docQuantity: number | null; // «Unid.»: 1, 15, 2,5…
  docUnit: string | null; // ud., kg, caja, saco…
  unitPrice: number | null; // € sin IVA por unidad del documento (con sus decimales)
  vatPct: number | null; // 4, 10, 21…
  lineTotalWithVatCents: number | null; // importe con IVA
  // Para el stock, en la unidad del ingrediente:
  ingredientId: string | null;
  newIngredient: ScanNewIngredient | null; // solo cuando ingredientId es null
  quantity: number | null; // en la unidad base del ingrediente
  packPriceCents: number | null; // precio sin IVA de UN formato del ingrediente
  lineTotalCents: number | null; // importe sin IVA de la línea, tal cual en el documento
  note: string | null;
};

export type VatRow = { pct: number; baseCents: number; vatCents: number };

export type ScanResult = {
  supplierId: string | null;
  supplierName: string | null;
  supplierTaxId: string | null; // NIF/CIF del proveedor
  documentNumber: string | null;
  documentDate: string | null;
  totalCents: number | null; // base imponible (sin IVA)
  vatCents: number | null; // cuota de IVA total
  totalWithVatCents: number | null; // total a pagar
  vatBreakdown: VatRow[]; // desglose por tipo, tal cual en el documento
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
    const ingredientId = x.kind !== "EXPENSE" && typeof x.ingredientId === "string" && ingIds.has(x.ingredientId) ? x.ingredientId : null;
    const newIngredient = ingredientId || x.kind === "EXPENSE" ? null : sanitizeNewIngredient(x.newIngredient);
    const quantity = numOrNull(x.quantity);
    const price = numOrNull(x.packPriceCents);
    const total = numOrNull(x.lineTotalCents);
    const kind: LineKind = x.kind === "EXPENSE" ? "EXPENSE" : "INGREDIENT";
    const docQ = numOrNull(x.docQuantity);
    const unitPrice = numOrNull(x.unitPrice);
    const vat = numOrNull(x.vatPct);
    const withVat = numOrNull(x.lineTotalWithVatCents);
    return [
      {
        description: description.slice(0, 200),
        kind,
        docQuantity: docQ != null && docQ !== 0 ? docQ : null,
        docUnit: strOrNull(x.docUnit)?.slice(0, 20) ?? null,
        unitPrice: unitPrice != null && unitPrice >= 0 ? Math.round(unitPrice * 10000) / 10000 : null,
        vatPct: vat != null && vat >= 0 && vat <= 30 ? vat : null,
        lineTotalWithVatCents: withVat != null && (withVat !== 0 || total === 0) ? Math.round(withVat) : null, // 0 = no aparece
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
  const vatTotal = numOrNull(r.vatCents);
  const withVat = numOrNull(r.totalWithVatCents);
  const vatBreakdown = (Array.isArray(r.vatBreakdown) ? r.vatBreakdown : []).flatMap((v): VatRow[] => {
    const o = (v ?? {}) as Record<string, unknown>;
    const pct = numOrNull(o.pct);
    const base = numOrNull(o.baseCents);
    const cuota = numOrNull(o.vatCents);
    return pct != null && base != null && cuota != null ? [{ pct, baseCents: Math.round(base), vatCents: Math.round(cuota) }] : [];
  });
  return {
    supplierId: typeof r.supplierId === "string" && supIds.has(r.supplierId) ? r.supplierId : null,
    supplierName: strOrNull(r.supplierName),
    supplierTaxId: strOrNull(r.supplierTaxId)?.slice(0, 20) ?? null,
    vatCents: vatTotal != null && (vatTotal !== 0 || (withVat != null && withVat === total)) ? Math.round(vatTotal) : null,
    totalWithVatCents: withVat != null && withVat > 0 ? Math.round(withVat) : null,
    vatBreakdown,
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

// IVA de una línea sin cuota explícita: base × tipo.
export const lineVatCents = (l: { lineTotalCents: number | null; vatPct: number | null; lineTotalWithVatCents: number | null }) =>
  l.lineTotalWithVatCents != null && l.lineTotalCents != null ? l.lineTotalWithVatCents - l.lineTotalCents : l.lineTotalCents != null && l.vatPct != null ? Math.round((l.lineTotalCents * l.vatPct) / 100) : null;

// ¿Las líneas leídas suman lo que dice la factura? Si no, falta o sobra algo
// (una línea sin leer, un descuento…). Tolerancia: 2 céntimos por línea de redondeo, mínimo 5.
export type InvoiceCheck = { linesBaseCents: number; linesWithVatCents: number | null; diffCents: number | null; ok: boolean };
export function invoiceCheck(scan: Pick<ScanResult, "totalCents" | "totalWithVatCents"> & { lines: Pick<ScanLine, "lineTotalCents" | "vatPct" | "lineTotalWithVatCents">[] }): InvoiceCheck {
  const linesBaseCents = scan.lines.reduce((a, l) => a + (l.lineTotalCents ?? 0), 0);
  const allVat = scan.lines.every((l) => l.lineTotalWithVatCents != null || (l.lineTotalCents != null && l.vatPct != null));
  const linesWithVatCents = allVat ? scan.lines.reduce((a, l) => a + (l.lineTotalWithVatCents ?? (l.lineTotalCents ?? 0) + (lineVatCents(l) ?? 0)), 0) : null;
  const tol = Math.max(5, scan.lines.length * 2);
  const diffCents = scan.totalWithVatCents != null && linesWithVatCents != null ? scan.totalWithVatCents - linesWithVatCents : scan.totalCents != null ? scan.totalCents - linesBaseCents : null;
  return { linesBaseCents, linesWithVatCents, diffCents, ok: diffCents != null && Math.abs(diffCents) <= tol };
}

// Desglose de IVA a partir de las líneas (cuando el documento no lo trae).
export function vatFromLines(lines: Pick<ScanLine, "lineTotalCents" | "vatPct" | "lineTotalWithVatCents">[]): VatRow[] {
  const by = new Map<number, VatRow>();
  for (const l of lines) {
    if (l.vatPct == null || l.lineTotalCents == null) continue;
    const row = by.get(l.vatPct) ?? { pct: l.vatPct, baseCents: 0, vatCents: 0 };
    row.baseCents += l.lineTotalCents;
    row.vatCents += lineVatCents(l) ?? 0;
    by.set(l.vatPct, row);
  }
  return [...by.values()].sort((a, b) => a.pct - b.pct);
}

// Factura que se guarda al aplicar (SupplierInvoice). Llega del panel tras la revisión.
export type InvoiceLineRecord = {
  description: string;
  kind: LineKind;
  docQuantity: number | null;
  docUnit: string | null;
  unitPrice: number | null;
  vatPct: number | null;
  lineTotalCents: number | null;
  lineTotalWithVatCents: number | null;
  ingredientId: string | null;
};
export type InvoiceRecord = {
  supplierName: string;
  supplierTaxId: string | null;
  number: string | null;
  date: Date | null;
  baseCents: number;
  vatCents: number;
  totalCents: number;
  expenseCents: number;
  vatBreakdown: VatRow[];
  lines: InvoiceLineRecord[];
};

const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

export function sanitizeInvoiceRecord(raw: unknown, fallbackSupplier: string | null): InvoiceRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const lines = (Array.isArray(r.lines) ? r.lines : []).slice(0, 300).flatMap((l): InvoiceLineRecord[] => {
    const x = (l ?? {}) as Record<string, unknown>;
    const description = strOrNull(x.description)?.slice(0, 200);
    if (!description) return [];
    const vat = numOrNull(x.vatPct);
    return [
      {
        description,
        kind: x.kind === "EXPENSE" ? "EXPENSE" : "INGREDIENT",
        docQuantity: numOrNull(x.docQuantity),
        docUnit: strOrNull(x.docUnit)?.slice(0, 20) ?? null,
        unitPrice: numOrNull(x.unitPrice),
        vatPct: vat != null && vat >= 0 && vat <= 30 ? vat : null,
        lineTotalCents: cents(x.lineTotalCents),
        lineTotalWithVatCents: cents(x.lineTotalWithVatCents),
        ingredientId: strOrNull(x.ingredientId)?.slice(0, 40) ?? null,
      },
    ];
  });
  if (!lines.length) return null;
  const vatRows = (Array.isArray(r.vatBreakdown) ? r.vatBreakdown : []).flatMap((v): VatRow[] => {
    const o = (v ?? {}) as Record<string, unknown>;
    const pct = numOrNull(o.pct);
    const b = cents(o.baseCents);
    const c = cents(o.vatCents);
    return pct != null && b != null && c != null ? [{ pct, baseCents: b, vatCents: c }] : [];
  });
  const vatBreakdown = vatRows.length ? vatRows : vatFromLines(lines);
  const baseCents = cents(r.baseCents) ?? lines.reduce((a, l) => a + (l.lineTotalCents ?? 0), 0);
  const vatCents = cents(r.vatCents) ?? vatBreakdown.reduce((a, v) => a + v.vatCents, 0);
  const totalCents = cents(r.totalCents) ?? baseCents + vatCents;
  const date = strOrNull(r.date);
  const d = date && /^\d{4}-\d{2}-\d{2}/.test(date) ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : null;
  return {
    supplierName: (strOrNull(r.supplierName) ?? fallbackSupplier ?? "Proveedor sin nombre").slice(0, 80),
    supplierTaxId: strOrNull(r.supplierTaxId)?.slice(0, 20) ?? null,
    number: strOrNull(r.number)?.slice(0, 60) ?? null,
    date: d && !Number.isNaN(d.getTime()) ? d : null,
    baseCents,
    vatCents,
    totalCents,
    expenseCents: lines.filter((l) => l.kind === "EXPENSE").reduce((a, l) => a + (l.lineTotalCents ?? 0), 0),
    vatBreakdown,
    lines,
  };
}
