// Inventario del módulo Costes (fase 2): consumo de stock por pedido, movimientos
// y agotado automático de platos/opciones. Se ejecuta dentro de transacciones de
// Prisma para que pedido y stock nunca queden a medias.
import type { Prisma, StockMovementType } from "@prisma/client";
import { revalidateMenu } from "@/app/lib/menuCache";
import { unitCostCents } from "@/app/lib/costs";
import { consumableQty, type OrderKind } from "@/app/lib/consumables";
export { appliesTo, consumableQty, orderKindOf, type ConsumableRule, type OrderKind } from "@/app/lib/consumables";

type Tx = Prisma.TransactionClient;

export type ConsumptionItem = { productId: string; quantity: number; optionIds: string[] };

// Cantidad de cada ingrediente CONTROLADO que consume un pedido: receta base de
// cada producto + receta de cada opción elegida, por la cantidad pedida.
export async function orderConsumption(tx: Tx, tenantId: string, items: ConsumptionItem[]): Promise<Map<string, number>> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const optionIds = [...new Set(items.flatMap((i) => i.optionIds))];
  const lines = await tx.recipeLine.findMany({
    where: {
      tenantId,
      ingredient: { trackStock: true },
      OR: [{ productId: { in: productIds } }, { modifierOptionId: { in: optionIds } }],
    },
    select: { productId: true, modifierOptionId: true, ingredientId: true, quantity: true },
  });

  const consumption = new Map<string, number>();
  const add = (ingredientId: string, qty: number) => consumption.set(ingredientId, (consumption.get(ingredientId) ?? 0) + qty);
  for (const item of items) {
    for (const l of lines) {
      if (l.productId === item.productId || (l.modifierOptionId && item.optionIds.includes(l.modifierOptionId))) {
        add(l.ingredientId, l.quantity * item.quantity);
      }
    }
  }
  return consumption;
}

// Consumibles que se gastan solos con cada pedido (bolsa, servilletas…), según
// el tipo de pedido: DELIVERY, TAKEAWAY (para llevar) o HERE (comer aquí).
// Solo los que se controlan en Inventario. Ver docs/MODULO-COSTES.md
export async function perOrderConsumables(tx: Tx, tenantId: string, kind: OrderKind, lines: { productId: string; quantity: number }[]): Promise<Map<string, number>> {
  const list = await tx.ingredient.findMany({
    where: { tenantId, kind: "CONSUMABLE", trackStock: true, OR: [{ perOrderQty: { gt: 0 } }, { perItemQty: { gt: 0 } }] },
    select: { id: true, perOrderQty: true, perOrderChannels: true, perItemQty: true, perItemCategoryIds: true },
  });
  if (!list.length) return new Map();
  const ids = [...new Set(lines.map((l) => l.productId))];
  const products = await tx.product.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, categoryId: true } });
  const catOf = new Map(products.map((p) => [p.id, p.categoryId]));
  const unitsByCategory = new Map<string, number>();
  for (const l of lines) {
    const cat = catOf.get(l.productId);
    if (cat) unitsByCategory.set(cat, (unitsByCategory.get(cat) ?? 0) + l.quantity);
  }
  const out = new Map<string, number>();
  for (const c of list) {
    const q = consumableQty(c, kind, unitsByCategory);
    if (q > 0) out.set(c.id, q);
  }
  return out;
}

// Aplica variaciones de stock (con signo), registra cada movimiento con su valor
// al coste útil actual y recalcula los agotados afectados.
export async function applyStockDeltas(
  tx: Tx,
  tenantId: string,
  deltas: Map<string, number>,
  type: StockMovementType,
  opts: { orderId?: string; note?: string; batch?: { ingredientId: string; factor: number } } = {}
): Promise<void> {
  const ids: string[] = [];
  for (const [ingredientId, delta] of deltas) {
    if (delta === 0) continue;
    const ing = await tx.ingredient.update({
      where: { id: ingredientId },
      data: { stockQty: { increment: delta } },
      select: { stockQty: true, packSize: true, packPriceCents: true, wastePct: true, tenantId: true },
    });
    if (ing.tenantId !== tenantId) throw new Error("Ingrediente de otro restaurante");
    await tx.stockMovement.create({
      data: {
        tenantId,
        ingredientId,
        type,
        quantity: delta,
        stockAfter: ing.stockQty,
        valueCents: Math.round(delta * unitCostCents(ing)),
        orderId: opts.orderId ?? null,
        note: opts.note ?? null,
        batchFactor: opts.batch?.ingredientId === ingredientId ? opts.batch.factor : null,
      },
    });
    ids.push(ingredientId);
  }
  if (ids.length) await refreshStockOuts(tx, tenantId, ids);
}

// Un plato/opción está agotado si algún ingrediente CONTROLADO de su receta no
// llega para hacer una unidad. Solo toca el flag automático (stockOut); el
// agotado manual del dueño (isAvailable) no se modifica.
export async function refreshStockOuts(tx: Tx, tenantId: string, ingredientIds: string[]): Promise<void> {
  const affected = await tx.recipeLine.findMany({
    where: { tenantId, ingredientId: { in: ingredientIds } },
    select: { productId: true, modifierOptionId: true },
  });
  const productIds = [...new Set(affected.flatMap((l) => (l.productId ? [l.productId] : [])))];
  const optionIds = [...new Set(affected.flatMap((l) => (l.modifierOptionId ? [l.modifierOptionId] : [])))];

  const isOut = (lines: { quantity: number; ingredient: { trackStock: boolean; stockQty: number } }[]) =>
    lines.some((l) => l.ingredient.trackStock && l.ingredient.stockQty < l.quantity);
  const lineSelect = { select: { quantity: true, ingredient: { select: { trackStock: true, stockQty: true } } } } as const;

  if (productIds.length) {
    const products = await tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, recipeLines: lineSelect } });
    const out = products.filter((p) => isOut(p.recipeLines)).map((p) => p.id);
    const back = products.filter((p) => !isOut(p.recipeLines)).map((p) => p.id);
    if (out.length) await tx.product.updateMany({ where: { id: { in: out } }, data: { stockOut: true } });
    if (out.length) void revalidateMenu(tenantId); // la carta pública oculta los agotados
    if (back.length) await tx.product.updateMany({ where: { id: { in: back } }, data: { stockOut: false } });
  }
  if (optionIds.length) {
    const options = await tx.modifierOption.findMany({ where: { id: { in: optionIds } }, select: { id: true, recipeLines: lineSelect } });
    const out = options.filter((o) => isOut(o.recipeLines)).map((o) => o.id);
    const back = options.filter((o) => !isOut(o.recipeLines)).map((o) => o.id);
    if (out.length) await tx.modifierOption.updateMany({ where: { id: { in: out } }, data: { stockOut: true } });
    if (out.length) void revalidateMenu(tenantId);
    if (back.length) await tx.modifierOption.updateMany({ where: { id: { in: back } }, data: { stockOut: false } });
  }
}

// Devuelve al stock lo que consumió un pedido (al cancelarlo). Idempotente: si
// ya se devolvió, no hace nada.
export async function returnOrderStock(tx: Tx, tenantId: string, orderId: string): Promise<void> {
  const moves = await tx.stockMovement.findMany({ where: { tenantId, orderId }, select: { ingredientId: true, quantity: true, type: true } });
  if (!moves.length || moves.some((m) => m.type === "ORDER_CANCEL")) return;
  const deltas = new Map<string, number>();
  for (const m of moves) if (m.type === "ORDER") deltas.set(m.ingredientId, (deltas.get(m.ingredientId) ?? 0) - m.quantity);
  await applyStockDeltas(tx, tenantId, deltas, "ORDER_CANCEL", { orderId });
}
