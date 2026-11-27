import { NextRequest, NextResponse, after } from "next/server";
import { autoTranslateMenu } from "@/app/lib/menuTranslate";
import { prisma } from "@/app/lib/prisma";
import { parsePromotion, retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/retention/promotions → crear promoción automática
export async function POST(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
  after(() => autoTranslateMenu(ctx.tenant.id));
  const body = await req.json().catch(() => null);
  const validProductIds = new Set((await prisma.product.findMany({ where: { tenantId: ctx.tenant.id, isActive: true, isCombo: false }, select: { id: true } })).map((p) => p.id));
  const input = parsePromotion(body, validProductIds);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const promotion = await prisma.promotion.create({ data: { tenantId: ctx.tenant.id, ...input } });
  return NextResponse.json({ promotion }, { status: 201 });
}
