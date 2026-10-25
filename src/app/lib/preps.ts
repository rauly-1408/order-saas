import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeAllergens, unitCostCents, type CostIngredient } from "./costs";

// Elaboraciones (salsa boloñesa, cochinita, caldo, pico de gallo…): una receta
// por lotes que rinde una cantidad. Su coste = ingredientes + otros costes del
// lote (mano de obra, horno, envases, maquila) ÷ lo que rinde. Se guardan como
// un ingrediente más (packSize = rinde, packPriceCents = coste del lote), así
// sirven en escandallos, stock y rentabilidad sin tocar nada. Ver docs/MODULO-COSTES.md

export type PrepExtra = { label: string; cents: number };
export type PrepCost = { ingredientsCents: number; extrasCents: number; totalCents: number; perUnitCents: number };

export function cleanExtras(raw: unknown): PrepExtra[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 20).flatMap((e) => {
    const o = (e ?? {}) as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
    const cents = Number(o.cents);
    return label && Number.isFinite(cents) && cents >= 0 && cents <= 10_000_000 ? [{ label, cents: Math.round(cents) }] : [];
  });
}

export function prepCost(lines: { quantity: number; ingredient: CostIngredient }[], extras: PrepExtra[], yieldQty: number): PrepCost {
  const ingredientsCents = lines.reduce((a, l) => a + (l.quantity > 0 ? l.quantity * unitCostCents(l.ingredient) : 0), 0);
  const extrasCents = extras.reduce((a, e) => a + e.cents, 0);
  const totalCents = ingredientsCents + extrasCents;
  return { ingredientsCents, extrasCents, totalCents, perUnitCents: yieldQty > 0 ? totalCents / yieldQty : 0 };
}

// ¿Usar `componentId` dentro de `prepId` crearía un círculo (A lleva B y B lleva A)?
export function createsCycle(prepId: string, componentId: string, linesOf: Map<string, string[]>): boolean {
  const seen = new Set<string>();
  const stack = [componentId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === prepId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(linesOf.get(id) ?? []));
  }
  return false;
}

type Db = PrismaClient | Prisma.TransactionClient;

// Recalcula el coste (y los alérgenos) de todas las elaboraciones del
// restaurante, de dentro afuera: el caldo antes que el jamón que lo lleva.
// Se llama tras cambiar precios, mermas o recetas.
export async function recalcPreps(db: Db, tenantId: string): Promise<void> {
  const preps = await db.ingredient.findMany({
    where: { tenantId, isPrep: true },
    select: { id: true, packSize: true, packPriceCents: true, wastePct: true, allergens: true, prepExtras: true, prepLines: { select: { ingredientId: true, quantity: true } } },
  });
  if (!preps.length) return;
  const compIds = [...new Set(preps.flatMap((p) => p.prepLines.map((l) => l.ingredientId)))];
  const comps = await db.ingredient.findMany({ where: { tenantId, id: { in: compIds } }, select: { id: true, packSize: true, packPriceCents: true, wastePct: true, allergens: true } });
  const byId = new Map<string, { packSize: number; packPriceCents: number; wastePct: number; allergens: string[] }>(comps.map((c) => [c.id, c]));
  const prepIds = new Set(preps.map((p) => p.id));
  const done = new Set<string>();
  // Orden por dependencias; un círculo (no debería haberlo) se corta a las 10 vueltas.
  for (let pass = 0; pass < 10 && done.size < preps.length; pass++) {
    for (const p of preps) {
      if (done.has(p.id)) continue;
      if (p.prepLines.some((l) => prepIds.has(l.ingredientId) && l.ingredientId !== p.id && !done.has(l.ingredientId)) && pass < 9) continue;
      const lines = p.prepLines.flatMap((l) => {
        const ing = byId.get(l.ingredientId);
        return ing ? [{ quantity: l.quantity, ingredient: ing }] : [];
      });
      const cost = prepCost(lines, cleanExtras(p.prepExtras), p.packSize);
      const price = Math.round(cost.totalCents);
      const allergens = normalizeAllergens([...new Set(lines.flatMap((l) => l.ingredient.allergens))]);
      if (price !== p.packPriceCents || p.wastePct !== 0 || allergens.join() !== p.allergens.join()) {
        await db.ingredient.update({ where: { id: p.id }, data: { packPriceCents: price, wastePct: 0, allergens } });
      }
      byId.set(p.id, { packSize: p.packSize, packPriceCents: price, wastePct: 0, allergens });
      done.add(p.id);
    }
  }
}
