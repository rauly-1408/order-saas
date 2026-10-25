import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, isUniqueViolation, lastSegment, parseIngredient } from "@/app/lib/costsApi";
import { recordPriceChange } from "@/app/lib/purchasing";
import { recalcPreps } from "@/app/lib/preps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const id = lastSegment(req);
  const input = parseIngredient(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  if (input.supplierId) {
    const ok = await prisma.supplier.count({ where: { id: input.supplierId, tenantId: ctx.tenant.id } });
    if (!ok) return NextResponse.json({ error: "Proveedor no válido" }, { status: 400 });
  }
  try {
    const before = await prisma.ingredient.findFirst({ where: { id, tenantId: ctx.tenant.id }, select: { packSize: true, packPriceCents: true, isPrep: true } });
    if (!before) return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });
    if (before.isPrep) return NextResponse.json({ error: "Es una elaboración: cámbiala en la pestaña Elaboraciones" }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.ingredient.update({ where: { id }, data: input });
      // Historial de precios: solo si cambia el coste por unidad.
      await recordPriceChange(tx, ctx.tenant.id, id, before, { packSize: input.packSize, packPriceCents: input.packPriceCents }, "MANUAL");
      await recalcPreps(tx, ctx.tenant.id); // las elaboraciones que lo llevan cambian de coste
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "Ya existe un ingrediente con ese nombre" }, { status: 409 });
    console.error("[PATCH costs/ingredients]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  // Sus líneas de escandallo se borran en cascada.
  const res = await prisma.ingredient.deleteMany({ where: { id: lastSegment(req), tenantId: ctx.tenant.id } });
  if (res.count === 0) return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });
  await recalcPreps(prisma, ctx.tenant.id);
  return NextResponse.json({ ok: true });
}
