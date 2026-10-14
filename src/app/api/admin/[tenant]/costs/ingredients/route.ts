import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, isUniqueViolation, parseIngredient } from "@/app/lib/costsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const ingredients = await prisma.ingredient.findMany({
    where: { tenantId: ctx.tenant.id },
    include: { supplier: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ ingredients });
}

export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parseIngredient(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  if (input.supplierId) {
    const ok = await prisma.supplier.count({ where: { id: input.supplierId, tenantId: ctx.tenant.id } });
    if (!ok) return NextResponse.json({ error: "Proveedor no válido" }, { status: 400 });
  }
  try {
    const ingredient = await prisma.ingredient.create({ data: { tenantId: ctx.tenant.id, ...input } });
    return NextResponse.json({ ingredient }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "Ya existe un ingrediente con ese nombre" }, { status: 409 });
    console.error("[POST costs/ingredients]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
