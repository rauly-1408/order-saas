import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";
import { computeSegment, SEGMENTS, type Segment } from "@/app/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CUSTOMERS = 2000;

// GET /api/admin/[tenant]/retention/overview → clientes, segmentos, cupones y campañas
export async function GET(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const now = new Date();

  const [customers, coupons, campaigns] = await Promise.all([
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
  ]);

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
    ? await prisma.order.findMany({ where: { id: { in: convertedIds }, status: { not: "CANCELLED" } }, select: { id: true, totalCents: true } })
    : [];
  const orderTotal = new Map(convertedOrders.map((o) => [o.id, o.totalCents]));

  return NextResponse.json({
    restaurant: ctx.tenant.name,
    segments,
    customers: rows,
    coupons,
    campaigns: campaigns.map(({ sends, ...c }) => ({
      ...c,
      couponCode: c.coupon?.code ?? null,
      recipients: sends.length,
      sent: sends.filter((s) => s.status === "SENT" || s.status === "CONVERTED").length,
      converted: sends.filter((s) => s.status === "CONVERTED").length,
      revenueCents: sends.reduce((sum, s) => sum + (s.convertedOrderId ? orderTotal.get(s.convertedOrderId) ?? 0 : 0), 0),
    })),
  });
}
