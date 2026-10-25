import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, isUniqueViolation, lastSegment } from "@/app/lib/costsApi";
import { checkPrepLines, parsePrep } from "@/app/lib/prepsApi";
import { recalcPreps } from "@/app/lib/preps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH → cambia una elaboración (receta, rendimiento, otros costes). Para
// borrarla vale DELETE costs/ingredients/[id].
export async function PATCH(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const id = lastSegment(req);
  const input = parsePrep(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const prep = await prisma.ingredient.findFirst({ where: { id, tenantId, isPrep: true }, select: { id: true } });
  if (!prep) return NextResponse.json({ error: "Elaboración no encontrada" }, { status: 404 });
  const problem = await checkPrepLines(tenantId, id, input.lines);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.prepLine.deleteMany({ where: { prepId: id } });
      await tx.ingredient.update({
        where: { id },
        data: {
          name: input.name,
          baseUnit: input.baseUnit,
          packSize: input.yieldQty,
          prepExtras: input.extras,
          prepNotes: input.notes,
          prepLines: { create: input.lines.map((l, i) => ({ tenantId, ingredientId: l.ingredientId, quantity: l.quantity, sortOrder: i })) },
        },
      });
      await recalcPreps(tx, tenantId);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "Ya hay un ingrediente o elaboración con ese nombre" }, { status: 409 });
    console.error("[PATCH costs/preps]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
