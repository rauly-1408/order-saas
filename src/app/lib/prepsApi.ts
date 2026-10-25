import type { BaseUnit } from "@prisma/client";
import { prisma } from "./prisma";
import { cleanExtras, createsCycle, type PrepExtra } from "./preps";

// Validación de una elaboración que llega del panel (costs/preps).
export type PrepInput = { name: string; baseUnit: BaseUnit; yieldQty: number; extras: PrepExtra[]; notes: string | null; lines: { ingredientId: string; quantity: number }[] };

const UNITS: BaseUnit[] = ["KG", "G", "L", "ML", "UNIT"];

export function parsePrep(body: unknown): PrepInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
  if (!name) return "Ponle un nombre a la elaboración";
  if (!UNITS.includes(b.baseUnit as BaseUnit)) return "Unidad no válida";
  const yieldQty = Number(b.yieldQty);
  if (!(yieldQty > 0)) return "Indica cuánto rinde el lote";
  const raw = Array.isArray(b.lines) ? b.lines.slice(0, 80) : [];
  const lines: PrepInput["lines"] = [];
  for (const r of raw) {
    const l = (r ?? {}) as Record<string, unknown>;
    const quantity = Number(l.quantity);
    if (typeof l.ingredientId !== "string" || !l.ingredientId) continue;
    if (!(quantity > 0)) return "Cada ingrediente necesita una cantidad mayor que 0";
    lines.push({ ingredientId: l.ingredientId, quantity });
  }
  if (!lines.length) return "Añade al menos un ingrediente";
  const notes = typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 4000) : null;
  return { name, baseUnit: b.baseUnit as BaseUnit, yieldQty, extras: cleanExtras(b.extras), notes, lines };
}

// Los ingredientes existen, son de este restaurante y no hacen círculo.
export async function checkPrepLines(tenantId: string, prepId: string | null, lines: PrepInput["lines"]): Promise<string | null> {
  const ids = [...new Set(lines.map((l) => l.ingredientId))];
  const found = await prisma.ingredient.count({ where: { tenantId, id: { in: ids } } });
  if (found !== ids.length) return "Algún ingrediente no existe";
  if (!prepId) return null;
  if (ids.includes(prepId)) return "Una elaboración no puede llevarse a sí misma";
  const all = await prisma.prepLine.findMany({ where: { tenantId }, select: { prepId: true, ingredientId: true } });
  const linesOf = new Map<string, string[]>();
  for (const l of all) if (l.prepId !== prepId) linesOf.set(l.prepId, [...(linesOf.get(l.prepId) ?? []), l.ingredientId]);
  const bad = ids.find((id) => createsCycle(prepId, id, linesOf));
  return bad ? "Esa elaboración ya lleva esta dentro: no se pueden meter la una en la otra" : null;
}
