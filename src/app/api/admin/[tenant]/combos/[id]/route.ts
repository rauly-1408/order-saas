import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { comboTenant, parseCombo, slotsCreate } from "@/app/lib/combosApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function findCombo(tenantId: string, id: string) {
  return prisma.product.findFirst({ where: { id, tenantId, isCombo: true }, select: { id: true } });
}

// PATCH → { isAvailable } para activar/agotar, o el combo completo para editarlo.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  if (!(await findCombo(ctx.tenant.id, id))) return NextResponse.json({ error: "Menú no encontrado" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body && Object.keys(body).length === 1 && typeof body.isAvailable === "boolean") {
    await prisma.product.update({ where: { id }, data: { isAvailable: body.isAvailable } });
    return NextResponse.json({ ok: true });
  }
  const valid = await prisma.product.findMany({ where: { tenantId: ctx.tenant.id, isCombo: false }, select: { id: true } });
  const input = parseCombo(body, new Set(valid.map((p) => p.id)));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  // Los pasos se reemplazan enteros: los pedidos ya hechos guardan su propio resumen.
  await prisma.$transaction([
    prisma.comboSlot.deleteMany({ where: { comboId: id } }),
    prisma.product.update({
      where: { id },
      data: { name: input.name, description: input.description, basePriceCents: input.priceCents, isAvailable: input.isAvailable, comboSlots: { create: slotsCreate(ctx.tenant.id, input) } },
    }),
  ]);
  return NextResponse.json({ ok: true });
}

// DELETE → borra el combo (los pedidos antiguos conservan su resumen).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const { id } = await params;
  if (!(await findCombo(ctx.tenant.id, id))) return NextResponse.json({ error: "Menú no encontrado" }, { status: 404 });
  await prisma.product.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
