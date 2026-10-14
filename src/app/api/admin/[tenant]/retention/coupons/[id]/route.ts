import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/[tenant]/retention/coupons/[id]  { active: boolean }
// Los cupones no se borran: los pedidos que los usaron guardan la referencia.
export async function PATCH(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  const body = (await req.json().catch(() => null)) as { active?: unknown } | null;
  if (typeof body?.active !== "boolean") return NextResponse.json({ error: "Falta 'active'" }, { status: 400 });
  const result = await prisma.coupon.updateMany({ where: { id, tenantId: ctx.tenant.id }, data: { active: body.active } });
  if (result.count === 0) return NextResponse.json({ error: "Cupón no encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
