import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant, isUniqueViolation, parseSupplier } from "@/app/lib/costsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const suppliers = await prisma.supplier.findMany({ where: { tenantId: ctx.tenant.id }, orderBy: { name: "asc" } });
  return NextResponse.json({ suppliers });
}

export async function POST(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parseSupplier(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  try {
    const supplier = await prisma.supplier.create({ data: { tenantId: ctx.tenant.id, ...input } });
    return NextResponse.json({ supplier }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 409 });
    console.error("[POST costs/suppliers]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
