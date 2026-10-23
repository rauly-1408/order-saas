import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Plan y facturación: módulos contratados y comisión de los
// pedidos pagados online, mes a mes (se factura aparte, como Shopify).
export async function GET(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, addons: true, platformFeeBps: true, createdAt: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  const sees = Boolean((await getSessionFromRequest(req))?.seesTakings);
  if (!sees) return NextResponse.json({ addons: tenant.addons, feePercent: tenant.platformFeeBps / 100, since: tenant.createdAt, months: [], hidden: true });

  const now = new Date();
  const months = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const agg = await prisma.order.aggregate({
        // Solo pagos online por la pasarela: la Caja (efectivo, datáfono, Bizum en el local) no lleva comisión.
        where: { tenantId: tenant.id, source: "ONLINE", paymentStatus: "PAID", paymentMethod: { in: ["CARD", "BIZUM"] }, paidAt: { gte: from, lt: to } },
        _count: true,
        _sum: { totalCents: true, applicationFeeCents: true },
      });
      return { month: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`, orders: agg._count, totalCents: agg._sum.totalCents ?? 0, feeCents: agg._sum.applicationFeeCents ?? 0 };
    })
  );
  return NextResponse.json({ addons: tenant.addons, feePercent: tenant.platformFeeBps / 100, since: tenant.createdAt, months });
}
