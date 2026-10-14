import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, isUniqueViolation, lastSegment, parseSupplier } from "@/app/lib/costsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const id = lastSegment(req);
  const input = parseSupplier(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  try {
    const res = await prisma.supplier.updateMany({ where: { id, tenantId: ctx.tenant.id }, data: input });
    if (res.count === 0) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 });
    console.error("[PATCH costs/suppliers]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  // Los ingredientes del proveedor quedan sin proveedor (onDelete: SetNull).
  const res = await prisma.supplier.deleteMany({ where: { id: lastSegment(req), tenantId: ctx.tenant.id } });
  if (res.count === 0) return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
