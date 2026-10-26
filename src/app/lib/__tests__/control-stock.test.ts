import { describe, expect, it } from "vitest";
import { averageYield, idleStock, stockReport, type ReportMovement } from "../stockReport";
import { suggestedOrderQty } from "../purchasing";

const d = (s: string) => new Date(`2026-10-${s}T12:00:00Z`);
const mv = (type: ReportMovement["type"], quantity: number, stockAfter: number, valueCents: number, day: string, ingredientId = "coch"): ReportMovement => ({ ingredientId, type, quantity, stockAfter, valueCents, createdAt: d(day) });

describe("informe de stock", () => {
  it("comprado, vendido, lo que debería quedar y lo que falta en el recuento", () => {
    // Cochinita: empieza en 20 kg, entran 60 kg, se venden 50 kg, se tira 1 kg y al contar hay 26 (faltan 3)
    const rows = stockReport(
      [
        mv("RECEIPT", 60_000, 80_000, 60_000, "20"),
        mv("ORDER", -30_000, 50_000, -30_000, "21"),
        mv("ORDER", -21_000, 29_000, -21_000, "22"),
        mv("ORDER_CANCEL", 1_000, 30_000, 1_000, "22"),
        mv("WASTE", -1_000, 29_000, -1_000, "23"),
        mv("COUNT", -3_000, 26_000, -3_000, "25"),
      ],
      new Map([["coch", 20_000]])
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.start).toBe(20_000);
    expect(r.bought).toBe(60_000);
    expect(r.sold).toBe(50_000);
    expect(r.wasted).toBe(1_000);
    expect(r.expected).toBe(29_000);
    expect(r.countDiff).toBe(-3_000);
    expect(r.end).toBe(26_000);
    expect(r.lossQty).toBe(4_000);
    expect(r.lossCents).toBe(4_000);
  });

  it("sin movimiento anterior, empieza con lo que había antes del primero", () => {
    const [r] = stockReport([mv("ORDER", -100, 400, -50, "21")], new Map());
    expect(r.start).toBe(500);
    expect(r.expected).toBe(400);
  });

  it("los lotes: salen sus ingredientes y entra lo que rinde", () => {
    const rows = stockReport([mv("PRODUCTION", -5_000, 0, -2_000, "21", "carne"), mv("PRODUCTION", 60, 60, 2_000, "21", "racion")], new Map());
    expect(rows.find((r) => r.ingredientId === "carne")!.usedInBatches).toBe(5_000);
    expect(rows.find((r) => r.ingredientId === "racion")!.produced).toBe(60);
  });

  it("lo que sobra en un recuento no cuenta como pérdida", () => {
    const [r] = stockReport([mv("COUNT", 500, 1_500, 200, "21")], new Map([["coch", 1_000]]));
    expect(r.lossQty).toBe(0);
    expect(r.lossCents).toBe(0);
  });
});

describe("género parado", () => {
  const now = d("26");
  it("con stock y sin salir nada en los días pedidos", () => {
    const out = idleStock(
      [
        { id: "a", trackStock: true, stockQty: 5 },
        { id: "b", trackStock: true, stockQty: 5 },
        { id: "c", trackStock: true, stockQty: 0 },
        { id: "d", trackStock: false, stockQty: 5 },
        { id: "e", trackStock: true, stockQty: 5 },
      ],
      new Map([["a", d("10")], ["b", d("24")], ["c", d("01")], ["d", d("01")]]),
      new Map([["e", d("15")]]),
      now,
      7
    );
    expect(out).toEqual([
      { id: "a", idleDays: 16 },
      { id: "e", idleDays: 11 },
    ]);
  });
});

describe("rendimiento real de los lotes", () => {
  it("media ponderada por el tamaño del lote", () => {
    const y = averageYield([
      { quantity: 48, batchFactor: 1 },
      { quantity: 52, batchFactor: 1 },
      { quantity: 99, batchFactor: 2 },
      { quantity: 10, batchFactor: null },
    ]);
    expect(y).toEqual({ perBatch: 199 / 4, count: 3, min: 48, max: 52 });
  });
  it("sin lotes no hay media", () => {
    expect(averageYield([])).toBeNull();
  });
});

describe("sugerencia de compra con stock normal", () => {
  it("al bajar del mínimo repone hasta el stock normal, en formatos completos", () => {
    // Cochinita: mínimo 50, normal 100, hay 45 → faltan 55 → bolsas de 10 → 60
    expect(suggestedOrderQty({ trackStock: true, stockQty: 45, minStock: 50, parStock: 100, packSize: 10 })).toBe(60);
  });
  it("sin stock normal, al doble del mínimo como antes", () => {
    expect(suggestedOrderQty({ trackStock: true, stockQty: 45, minStock: 50, packSize: 10 })).toBe(60);
    expect(suggestedOrderQty({ trackStock: true, stockQty: 45, minStock: 50, parStock: null, packSize: 1 })).toBe(55);
  });
  it("por encima del mínimo no sugiere nada", () => {
    expect(suggestedOrderQty({ trackStock: true, stockQty: 60, minStock: 50, parStock: 100, packSize: 10 })).toBe(0);
  });
});
