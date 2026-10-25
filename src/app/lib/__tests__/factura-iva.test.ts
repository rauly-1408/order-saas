import { describe, expect, it } from "vitest";
import { invoiceCheck, lineVatCents, sanitizeInvoiceRecord, sanitizeScan, vatFromLines } from "../invoice";

// Facturas de proveedor: unidades tal cual, IVA y cuadre con el total.
// Datos de una factura real de Mercadona (resumida).
const lines = [
  { lineTotalCents: 3614, vatPct: 10, lineTotalWithVatCents: 3975 }, // 15 batata
  { lineTotalCents: 4615, vatPct: 4, lineTotalWithVatCents: 4800 }, // 16 patatas
  { lineTotalCents: 165, vatPct: 21, lineTotalWithVatCents: 200 }, // amoniaco (gasto)
];

describe("Facturas de proveedor · IVA y cuadre", () => {
  it("el IVA de la línea sale del importe con IVA o de base × tipo", () => {
    expect(lineVatCents(lines[0])).toBe(361);
    expect(lineVatCents({ lineTotalCents: 1000, vatPct: 10, lineTotalWithVatCents: null })).toBe(100);
  });
  it("desglosa el IVA por tipo", () => {
    expect(vatFromLines(lines)).toEqual([
      { pct: 4, baseCents: 4615, vatCents: 185 },
      { pct: 10, baseCents: 3614, vatCents: 361 },
      { pct: 21, baseCents: 165, vatCents: 35 },
    ]);
  });
  it("cuadra si las líneas suman el total con IVA", () => {
    expect(invoiceCheck({ totalCents: 8394, totalWithVatCents: 8975, lines }).ok).toBe(true);
  });
  it("avisa si falta una línea", () => {
    const c = invoiceCheck({ totalCents: 9394, totalWithVatCents: 10075, lines });
    expect(c.ok).toBe(false);
    expect(c.diffCents).toBe(1100);
  });
  it("guarda la cantidad tal cual del documento y los gastos no llevan ingrediente", () => {
    const r = sanitizeScan(
      {
        supplierName: "MERCADONA S.A.",
        supplierTaxId: "A-46103834",
        totalCents: 413,
        vatCents: 17,
        totalWithVatCents: 430,
        vatBreakdown: [],
        lines: [
          { description: "12 HUEVOS SUPER GRAN", kind: "INGREDIENT", docQuantity: 1, docUnit: "ud.", unitPrice: 4.13461, vatPct: 4, lineTotalWithVatCents: 430, lineTotalCents: 413, quantity: 12, ingredientId: null, newIngredient: { name: "Huevo", baseUnit: "UNIT", packSize: 12, packPriceCents: 413, allergens: ["huevos"] } },
          { description: "BOLSA PLASTICO", kind: "EXPENSE", docQuantity: 1, docUnit: "", unitPrice: 0.124, vatPct: 21, lineTotalWithVatCents: 15, lineTotalCents: 12, quantity: 1, ingredientId: "x", newIngredient: { name: "Bolsa", baseUnit: "UNIT", packSize: 1, packPriceCents: 12, allergens: [] } },
        ],
      },
      [],
      []
    );
    expect(r.lines[0]).toMatchObject({ docQuantity: 1, docUnit: "ud.", unitPrice: 4.1346, vatPct: 4, quantity: 12 });
    expect(r.lines[1]).toMatchObject({ kind: "EXPENSE", ingredientId: null, newIngredient: null, docUnit: null });
    expect(r.totalWithVatCents).toBe(430);
  });
  it("la factura guardada calcula lo que falte y separa los gastos", () => {
    const inv = sanitizeInvoiceRecord({ supplierName: "Mercadona", number: "A-1", date: "2026-09-30", lines: [{ description: "Batata", kind: "INGREDIENT", lineTotalCents: 3614, vatPct: 10, lineTotalWithVatCents: 3975 }, { description: "Bolsa", kind: "EXPENSE", lineTotalCents: 12, vatPct: 21, lineTotalWithVatCents: 15 }] }, null)!;
    expect(inv).toMatchObject({ baseCents: 3626, vatCents: 364, totalCents: 3990, expenseCents: 12 });
    expect(inv.date?.toISOString().slice(0, 10)).toBe("2026-09-30");
  });
});
