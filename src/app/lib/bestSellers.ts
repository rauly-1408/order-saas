import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";

// «Lo más pedido»: en cada categoría de la tienda, el producto que más
// unidades ha vendido en los últimos 30 días (si llega a un mínimo). Se pone
// solo, sin que nadie lo marque. Se recalcula cada hora. Ver docs/TIENDA-DISENO.md

const DAYS = 30;
export const MIN_UNITS = 5;

async function queryUnits(tenantId: string): Promise<Record<string, number>> {
  const rows = await prisma.orderLine.groupBy({
    by: ["productId"],
    where: { order: { tenantId, createdAt: { gte: new Date(Date.now() - DAYS * 86_400_000) }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } } },
    _sum: { quantity: true },
  });
  return Object.fromEntries(rows.map((r) => [r.productId, r._sum.quantity ?? 0]));
}

export function cachedUnitsSold(tenantId: string): Promise<Record<string, number>> {
  return unstable_cache(() => queryUnits(tenantId), ["units-sold-30d", tenantId], { revalidate: 3600 })();
}

// El más vendido de cada categoría (uno por categoría, con un mínimo de unidades).
export function pickBestSellers(categories: { products: { id: string; isCombo?: boolean }[] }[], units: Record<string, number>, min = MIN_UNITS): Set<string> {
  const out = new Set<string>();
  for (const c of categories) {
    let best: { id: string; n: number } | null = null;
    for (const p of c.products) {
      const n = units[p.id] ?? 0;
      if (n >= min && (!best || n > best.n)) best = { id: p.id, n };
    }
    if (best) out.add(best.id);
  }
  return out;
}
