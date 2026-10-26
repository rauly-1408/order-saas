import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { applyStockDeltas } from "@/app/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { factor, made? } → «He hecho un lote»: salen del stock los ingredientes
// de la receta × factor (1 = el lote de la receta; 2 = el doble…) y entra lo que
// rinde × factor, o lo que ha salido de verdad (`made`, en la unidad base) si se
// apunta. Queda guardado para la media de lo que rinden los lotes.
// Ver docs/MODULO-COSTES.md
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const id = new URL(req.url).pathname.split("/").at(-2) ?? "";
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const factor = Number(b.factor);
  if (!(factor > 0 && factor <= 1000)) return NextResponse.json({ error: "Cantidad del lote no válida" }, { status: 400 });
  const actual = b.made == null || b.made === "" ? null : Number(b.made);
  if (actual !== null && !(actual > 0 && Number.isFinite(actual))) return NextResponse.json({ error: "Lo que ha salido no es válido" }, { status: 400 });
  const prep = await prisma.ingredient.findFirst({
    where: { id, tenantId, isPrep: true },
    select: { id: true, name: true, packSize: true, prepLines: { select: { ingredientId: true, quantity: true, ingredient: { select: { trackStock: true } } } } },
  });
  if (!prep) return NextResponse.json({ error: "Elaboración no encontrada" }, { status: 404 });
  const deltas = new Map<string, number>();
  // Solo sale lo que ya se controla: un ingrediente sin control de stock se
  // quedaría en negativo y podría marcar platos como agotados.
  for (const l of prep.prepLines) if (l.ingredient.trackStock) deltas.set(l.ingredientId, (deltas.get(l.ingredientId) ?? 0) - l.quantity * factor);
  const made = actual ?? prep.packSize * factor;
  deltas.set(prep.id, (deltas.get(prep.id) ?? 0) + made);
  await prisma.$transaction(async (tx) => {
    // La elaboración se cuenta desde su primer lote.
    await tx.ingredient.update({ where: { id: prep.id }, data: { trackStock: true } });
    await applyStockDeltas(tx, tenantId, deltas, "PRODUCTION", { note: `Lote de ${prep.name}`, batch: { ingredientId: prep.id, factor } });
  });
  return NextResponse.json({ ok: true, made, untracked: prep.prepLines.filter((l) => !l.ingredient.trackStock).length });
}
