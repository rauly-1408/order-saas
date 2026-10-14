import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { isUniqueViolation, parseCoupon, retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/retention/coupons → crear cupón
export async function POST(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parseCoupon(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  try {
    const coupon = await prisma.coupon.create({ data: { tenantId: ctx.tenant.id, ...input } });
    return NextResponse.json({ coupon }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return NextResponse.json({ error: "Ya existe un cupón con ese código" }, { status: 409 });
    console.error("[POST retention/coupons]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
