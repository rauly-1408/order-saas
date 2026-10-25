import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, isUniqueViolation } from "@/app/lib/costsApi";
import { checkPrepLines, parsePrep } from "@/app/lib/prepsApi";
import { recalcPreps } from "@/app/lib/preps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { name, baseUnit, yieldQty, extras, notes, lines } → nueva elaboración. Ver docs/MODULO-COSTES.md
export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const input = parsePrep(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const problem = await checkPrepLines(tenantId, null, input.lines);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    const prep = await prisma.ingredient.create({
      data: {
        tenantId,
        name: input.name,
        baseUnit: input.baseUnit,
        packSize: input.yieldQty,
        packPriceCents: 0,
        isPrep: true,
        prepExtras: input.extras,
        prepNotes: input.notes,
        prepLines: { create: input.lines.map((l, i) => ({ tenantId, ingredientId: l.ingredientId, quantity: l.quantity, sortOrder: i })) },
      },
      select: { id: true },
    });
    await recalcPreps(prisma, tenantId);
    return NextResponse.json({ id: prep.id }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "Ya hay un ingrediente o elaboración con ese nombre" }, { status: 409 });
    console.error("[POST costs/preps]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
