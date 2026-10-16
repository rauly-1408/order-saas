import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { parsePromotion, retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/retention/promotions → crear promoción automática
export async function POST(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parsePromotion(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const promotion = await prisma.promotion.create({ data: { tenantId: ctx.tenant.id, ...input } });
  return NextResponse.json({ promotion }, { status: 201 });
}
