import { NextRequest, NextResponse, after } from "next/server";
import { autoTranslateMenu } from "@/app/lib/menuTranslate";
import { prisma } from "@/app/lib/prisma";
import { parsePromotion, retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH → { active } para activar/pausar, o la promoción completa para editarla.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
  after(() => autoTranslateMenu(ctx.tenant.id));
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const existing = await prisma.promotion.findFirst({ where: { id, tenantId: ctx.tenant.id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Promoción no encontrada" }, { status: 404 });
  if (body && Object.keys(body).length === 1 && typeof body.active === "boolean") {
    const promotion = await prisma.promotion.update({ where: { id }, data: { active: body.active } });
    return NextResponse.json({ promotion });
  }
  const input = parsePromotion(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const promotion = await prisma.promotion.update({ where: { id }, data: input });
  return NextResponse.json({ promotion });
}
