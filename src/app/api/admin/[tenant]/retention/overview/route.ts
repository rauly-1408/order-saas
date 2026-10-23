import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";
import { computeSegment, SEGMENTS, type Segment } from "@/app/lib/retention";
import { aiConfigured } from "@/app/lib/aiCopy";
import { getSessionFromRequest } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CUSTOMERS = 2000;

// GET /api/admin/[tenant]/retention/overview → clientes, segmentos, cupones y campañas
export async function GET(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const now = new Date();
  const sees = Boolean((await getSessionFromRequest(req))?.seesTakings); // «Ve lo recaudado»

  const [customers, coupons, campaigns, promotions, loyalty, categories, promoUses, loyaltyUses] = await Promise.all([
    prisma.customer.findMany({
      where: { tenantId },
      orderBy: { lastOrderAt: "desc" },
      take: MAX_CUSTOMERS,
      select: {
        id: true, name: true, phone: true, segment: true, ordersCount: true, totalSpentCents: true,
        firstOrderAt: true, lastOrderAt: true, marketingConsent: true,
      },
    }),
    prisma.coupon.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        coupon: { select: { code: true } },
        sends: { select: { status: true, convertedOrderId: true } },
      },
    }),
    prisma.promotion.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
    prisma.loyaltyProgram.findUnique({ where: { tenantId } }),
    prisma.category.findMany({ where: { tenantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.order.groupBy({ by: ["promotionId"], where: { tenantId, promotionId: { not: null }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } }, _count: true, _sum: { promotionDiscountCents: true } }),
    prisma.order.aggregate({ where: { tenantId, loyaltyReward: true, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } }, _count: true, _sum: { loyaltyDiscountCents: true } }),
  ]);
  const usesByPromo = new Map(promoUses.map((u) => [u.promotionId, { uses: u._count, discountCents: u._sum.promotionDiscountCents ?? 0 }]));

  // Segmento recalculado con la fecha de hoy ("en riesgo" no espera a un pedido
  // nuevo) y guardado para que las consultas por segmento estén al día.
  const changed = new Map<Segment, string[]>();
  const rows = customers.map((c) => {
    const segment = computeSegment(c.ordersCount, c.totalSpentCents, c.lastOrderAt, now);
    if (segment !== c.segment) changed.set(segment, [...(changed.get(segment) ?? []), c.id]);
    return { ...c, segment };
  });
  if (changed.size) {
    await prisma.$transaction(
      [...changed].map(([segment, ids]) => prisma.customer.updateMany({ where: { id: { in: ids } }, data: { segment } }))
    );
  }

  const segments = SEGMENTS.map((segment) => {
    const inSeg = rows.filter((c) => c.segment === segment);
    return { segment, count: inSeg.length, reachable: inSeg.filter((c) => c.marketingConsent).length };
  });

  // Ingresos atribuidos: suma de los pedidos que convirtieron cada campaña.
  const convertedIds = campaigns.flatMap((c) => c.sends.map((s) => s.convertedOrderId).filter((id): id is string => !!id));
  const convertedOrders = convertedIds.length
    ? await prisma.order.findMany({ where: { id: { in: convertedIds }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } }, select: { id: true, totalCents: true } })
    : [];
  const orderTotal = new Map(convertedOrders.map((o) => [o.id, o.totalCents]));

  return NextResponse.json({
    restaurant: ctx.tenant.name,
    aiEnabled: aiConfigured(),
    segments,
    customers: sees ? rows : rows.map((c) => ({ ...c, totalSpentCents: null })),
    coupons,
    promotions: promotions.map((p) => ({ ...p, ...(usesByPromo.get(p.id) ?? { uses: 0, discountCents: 0 }) })),
    loyalty: loyalty && { ...loyalty, rewardsGiven: loyaltyUses._count, rewardsCents: loyaltyUses._sum.loyaltyDiscountCents ?? 0 },
    categories,
    campaigns: campaigns.map(({ sends, ...c }) => ({
      ...c,
      couponCode: c.coupon?.code ?? null,
      recipients: sends.length,
      sent: sends.filter((s) => s.status === "SENT" || s.status === "CONVERTED").length,
      converted: sends.filter((s) => s.status === "CONVERTED").length,
      revenueCents: sees ? sends.reduce((sum, s) => sum + (s.convertedOrderId ? orderTotal.get(s.convertedOrderId) ?? 0 : 0), 0) : null,
    })),
  });
}
