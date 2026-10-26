// Control de stock: informe por fechas (comprado / vendido / lo que debería
// quedar / lo que se contó → pérdidas), género parado y lo que rinden de
// verdad los lotes. Funciones puras: se usan en el servidor y en los tests.
// Ver docs/MODULO-COSTES.md

export type ReportMovement = {
  ingredientId: string;
  type: "ORDER" | "ORDER_CANCEL" | "RECEIPT" | "COUNT" | "WASTE" | "PRODUCTION" | "USE";
  quantity: number; // con signo, en unidad base
  stockAfter: number;
  valueCents: number; // con signo
  createdAt: Date;
};

export type ReportRow = {
  ingredientId: string;
  start: number; // stock al empezar el periodo
  bought: number; // entradas de mercancía
  produced: number; // lo que entra de los lotes (elaboraciones)
  sold: number; // salido con los pedidos (ya restadas las cancelaciones)
  usedInBatches: number; // salido para hacer lotes
  wasted: number; // mermas declaradas y consumibles gastados a mano
  expected: number; // lo que debería quedar sin contar los recuentos
  countDiff: number; // descuadre de los recuentos (negativo = falta)
  end: number; // stock al acabar el periodo
  lossQty: number; // mermas + lo que faltó en los recuentos
  lossCents: number; // valor de esas pérdidas
  boughtCents: number;
  soldCents: number;
};

// Una fila por ingrediente con movimientos en el periodo. `before` es el último
// movimiento de cada ingrediente ANTES de `from` (para saber con cuánto empezó).
export function stockReport(inRange: ReportMovement[], before: Map<string, number>): ReportRow[] {
  const sorted = [...inRange].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const rows = new Map<string, ReportRow>();
  for (const m of sorted) {
    let r = rows.get(m.ingredientId);
    if (!r) {
      const start = before.get(m.ingredientId) ?? m.stockAfter - m.quantity;
      r = { ingredientId: m.ingredientId, start, bought: 0, produced: 0, sold: 0, usedInBatches: 0, wasted: 0, expected: 0, countDiff: 0, end: start, lossQty: 0, lossCents: 0, boughtCents: 0, soldCents: 0 };
      rows.set(m.ingredientId, r);
    }
    switch (m.type) {
      case "RECEIPT":
        r.bought += m.quantity;
        r.boughtCents += m.valueCents;
        break;
      case "PRODUCTION":
        if (m.quantity > 0) r.produced += m.quantity;
        else r.usedInBatches -= m.quantity;
        break;
      case "ORDER":
      case "ORDER_CANCEL":
        r.sold -= m.quantity;
        r.soldCents -= m.valueCents;
        break;
      case "WASTE":
      case "USE":
        r.wasted -= m.quantity;
        r.lossCents -= m.valueCents;
        break;
      case "COUNT":
        r.countDiff += m.quantity;
        // Solo cuenta como pérdida lo que falta; lo que sobra se queda en el descuadre.
        if (m.valueCents < 0) r.lossCents -= m.valueCents;
        break;
    }
    r.end = m.stockAfter;
  }
  for (const r of rows.values()) {
    r.expected = r.start + r.bought + r.produced - r.sold - r.usedInBatches - r.wasted;
    r.lossQty = r.wasted + Math.max(-r.countDiff, 0);
  }
  return [...rows.values()];
}

export type IdleInput = { id: string; trackStock: boolean; stockQty: number; isActive?: boolean };

// Género parado: controlado, con stock y sin salir nada en `days` días.
// `lastOut` es la fecha de la última salida (pedido, lote o gasto) y `firstSeen`
// la del primer movimiento (si nunca ha salido, se cuenta desde que entró).
export function idleStock(ingredients: IdleInput[], lastOut: Map<string, Date>, firstSeen: Map<string, Date>, now: Date, days: number): { id: string; idleDays: number }[] {
  const out: { id: string; idleDays: number }[] = [];
  for (const i of ingredients) {
    if (!i.trackStock || i.isActive === false || !(i.stockQty > 0)) continue;
    const since = lastOut.get(i.id) ?? firstSeen.get(i.id);
    if (!since) continue;
    const idleDays = Math.floor((now.getTime() - since.getTime()) / 86_400_000);
    if (idleDays >= days) out.push({ id: i.id, idleDays });
  }
  return out.sort((a, b) => b.idleDays - a.idleDays);
}

// Lo que rinde de verdad un lote: media de los últimos lotes registrados
// (cada uno con lo que salió y cuántas veces la receta era).
export function averageYield(batches: { quantity: number; batchFactor: number | null }[]): { perBatch: number; count: number; min: number; max: number } | null {
  const valid = batches.filter((b) => b.batchFactor != null && b.batchFactor > 0 && b.quantity > 0);
  if (!valid.length) return null;
  const per = valid.map((b) => b.quantity / b.batchFactor!);
  const totalQty = valid.reduce((a, b) => a + b.quantity, 0);
  const totalFactor = valid.reduce((a, b) => a + b.batchFactor!, 0);
  return { perBatch: totalQty / totalFactor, count: valid.length, min: Math.min(...per), max: Math.max(...per) };
}
