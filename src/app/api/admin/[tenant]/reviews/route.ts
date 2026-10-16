import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/reviews → reseñas recibidas (motor de retención) con su pedido.
export async function GET(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const reviews = await prisma.review.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true, rating: true, comment: true, createdAt: true,
      order: { select: { orderNumber: true, customerName: true, channel: true, totalCents: true } },
    },
  });
  const delivered = await prisma.order.count({ where: { tenantId: ctx.tenant.id, status: "DELIVERED" } });
  return NextResponse.json({ reviews, delivered });
}
