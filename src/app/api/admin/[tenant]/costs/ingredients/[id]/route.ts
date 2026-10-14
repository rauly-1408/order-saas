import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, isUniqueViolation, lastSegment, parseIngredient } from "@/app/lib/costsApi";

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
    const res = await prisma.ingredient.updateMany({ where: { id, tenantId: ctx.tenant.id }, data: input });
    if (res.count === 0) return NextResponse.json({ error: "Ingrediente no encontrado" }, { status: 404 });
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
  return NextResponse.json({ ok: true });
}
