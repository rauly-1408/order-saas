import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { addDays, daysBetween, localParts, startOfDayIn, tenantTimeZone } from "@/app/lib/time";
import { MAX_RANGE_DAYS, type ReportOrder } from "@/app/lib/reports";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export type ReportRange = { from: string; to: string; start: Date; end: Date; prevStart: Date; timeZone: string };

// Guard + periodo pedido (?from=AAAA-MM-DD&to=AAAA-MM-DD, por defecto los últimos 7 días).
export async function reportContext(
  req: NextRequest
): Promise<{ tenant: { id: string; name: string }; range: ReportRange } | { error: NextResponse }> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };

  const timeZone = tenantTimeZone(tenant.settings);
  const today = localParts(new Date(), timeZone).ymd;
  const to = url.searchParams.get("to") ?? today;
  const from = url.searchParams.get("from") ?? addDays(to, -6);
  if (!YMD.test(from) || !YMD.test(to)) return { error: NextResponse.json({ error: "Fechas no válidas" }, { status: 400 }) };
  const days = daysBetween(from, to) + 1;
  if (days < 1) return { error: NextResponse.json({ error: "La fecha de inicio debe ser anterior a la de fin" }, { status: 400 }) };
  if (days > MAX_RANGE_DAYS) return { error: NextResponse.json({ error: "El periodo no puede pasar de un año" }, { status: 400 }) };

  const start = startOfDayIn(timeZone, from);
  const end = startOfDayIn(timeZone, addDays(to, 1));
  const prevStart = startOfDayIn(timeZone, addDays(from, -days));
  return { tenant: { id: tenant.id, name: tenant.name }, range: { from, to, start, end, prevStart, timeZone } };
}

// Pedidos de [desde, hasta) con lo que necesita el informe.
export async function loadReportOrders(tenantId: string, from: Date, to: Date): Promise<(ReportOrder & { orderNumber: number | null; customerName: string; customerPhone: string; subtotalCents: number })[]> {
  const orders = await prisma.order.findMany({
    where: { tenantId, createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: "asc" },
    select: {
      createdAt: true, status: true, channel: true, orderNumber: true, customerName: true, customerPhone: true,
      subtotalCents: true, totalCents: true, discountCents: true, feesCents: true, customerId: true,
      coupon: { select: { code: true } },
      customer: { select: { firstOrderAt: true } },
      items: { select: { productId: true, productName: true, quantity: true, totalCents: true } },
    },
  });
  const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, category: { select: { name: true } } } })
    : [];
  const categoryOf = new Map(products.map((p) => [p.id, p.category?.name ?? null]));
  // Productos borrados o recreados: se busca la categoría por el nombre guardado en el pedido.
  const orphanNames = [...new Set(orders.flatMap((o) => o.items.filter((i) => !categoryOf.has(i.productId)).map((i) => i.productName)))];
  const byName = orphanNames.length
    ? await prisma.product.findMany({ where: { tenantId, name: { in: orphanNames } }, select: { name: true, category: { select: { name: true } } } })
    : [];
  const categoryByName = new Map(byName.map((p) => [p.name, p.category?.name ?? null]));
  return orders.map((o) => ({
    createdAt: o.createdAt,
    status: o.status,
    channel: o.channel,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    subtotalCents: o.subtotalCents,
    totalCents: o.totalCents,
    discountCents: o.discountCents,
    feesCents: o.feesCents,
    couponCode: o.coupon?.code ?? null,
    customerId: o.customerId,
    customerFirstOrderAt: o.customer?.firstOrderAt ?? null,
    lines: o.items.map((i) => ({ productId: i.productId, productName: i.productName, categoryName: categoryOf.get(i.productId) ?? categoryByName.get(i.productName) ?? null, quantity: i.quantity, totalCents: i.totalCents })),
  }));
}
