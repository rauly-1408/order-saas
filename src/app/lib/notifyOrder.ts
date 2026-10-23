// Avisos por email al restaurante: pedido nuevo y resumen diario. Se envían al
// email de contacto de «Información del negocio» si los avisos están activos en
// Configuración → Notificaciones y hay RESEND_API_KEY. Ver docs/OPERACIONES.md
import { prisma } from "@/app/lib/prisma";
import { readBusiness } from "@/app/lib/business";
import { dailySummaryEmail, emailConfigured, newOrderEmail, sendEmail } from "@/app/lib/email";
import { modifierLabels } from "@/app/lib/menuOptions";
import { scheduledLabel } from "@/app/lib/schedule";
import { startOfTodayIn, tenantTimeZone } from "@/app/lib/time";

export type NotificationPrefs = { newOrderEmail: boolean; dailySummaryEmail: boolean };

export function readNotificationPrefs(settings: unknown): NotificationPrefs {
  const n = ((settings ?? {}) as Record<string, unknown>).notifications as Record<string, unknown> | undefined;
  return { newOrderEmail: n?.newOrderEmail !== false, dailySummaryEmail: n?.dailySummaryEmail !== false };
}

function appOrigin(): string {
  const v = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return v || "http://localhost:3000";
}

// Pedido nuevo (ya pagado si era online). Nunca lanza: un fallo del email no toca el pedido.
export async function notifyNewOrder(orderId: string): Promise<void> {
  if (!emailConfigured()) return;
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, tenant: { select: { slug: true, name: true, settings: true } } },
    });
    if (!order || order.status === "AWAITING_PAYMENT" || order.status === "CANCELLED") return;
    const to = readBusiness(order.tenant.settings).email;
    if (!to || !readNotificationPrefs(order.tenant.settings).newOrderEmail) return;
    const tz = tenantTimeZone(order.tenant.settings);
    const msg = newOrderEmail({
      restaurant: order.tenant.name,
      orderNumber: order.orderNumber ?? 0,
      channel: order.channel === "DELIVERY" ? "DELIVERY" : "TAKEAWAY",
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      address: order.customerAddress,
      scheduledFor: order.scheduledFor ? scheduledLabel(order.scheduledFor, new Date(), tz) : null,
      lines: order.items.map((l) => ({ quantity: l.quantity, name: l.productName, detail: [...modifierLabels(l.modifiers), ...(l.note ? [`Nota: ${l.note}`] : [])], totalCents: l.totalCents })),
      totalCents: order.totalCents,
      paid: order.paymentStatus === "PAID",
      panelUrl: `${appOrigin()}/admin/${order.tenant.slug}/pedidos`,
    });
    await sendEmail({ to, ...msg });
  } catch (err) {
    console.error("[notifyNewOrder]", err instanceof Error ? err.message : err);
  }
}

// Resumen del último día completo (en la hora del restaurante) para cada
// restaurante con el aviso activo. Devuelve cuántos emails se enviaron.
export async function sendDailySummaries(now = new Date()): Promise<{ sent: number; skipped: number }> {
  if (!emailConfigured()) return { sent: 0, skipped: 0 };
  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true, name: true, settings: true } });
  let sent = 0;
  let skipped = 0;
  for (const t of tenants) {
    const to = readBusiness(t.settings).email;
    if (!to || !readNotificationPrefs(t.settings).dailySummaryEmail) {
      skipped++;
      continue;
    }
    const tz = tenantTimeZone(t.settings);
    const todayStart = startOfTodayIn(tz, now);
    const dayStart = startOfTodayIn(tz, new Date(todayStart.getTime() - 12 * 3_600_000));
    const valid = { tenantId: t.id, createdAt: { gte: dayStart, lt: todayStart }, status: { notIn: ["CANCELLED" as const, "AWAITING_PAYMENT" as const] } };
    const [orders, sum, delivery, cancelled, lines] = await Promise.all([
      prisma.order.count({ where: valid }),
      prisma.order.aggregate({ where: valid, _sum: { totalCents: true } }),
      prisma.order.count({ where: { ...valid, channel: "DELIVERY" } }),
      prisma.order.count({ where: { tenantId: t.id, createdAt: { gte: dayStart, lt: todayStart }, status: "CANCELLED" } }),
      prisma.orderLine.groupBy({ by: ["productName"], where: { order: valid }, _sum: { quantity: true }, orderBy: { _sum: { quantity: "desc" } }, take: 3 }),
    ]);
    if (orders === 0 && cancelled === 0) {
      skipped++; // día sin actividad: no molestamos
      continue;
    }
    const dayLabel = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(dayStart);
    const msg = dailySummaryEmail({
      restaurant: t.name,
      dayLabel,
      orders,
      revenueCents: sum._sum.totalCents ?? 0,
      delivery,
      takeaway: orders - delivery,
      cancelled,
      top: lines.map((l) => ({ name: l.productName, units: l._sum.quantity ?? 0 })),
      reportsUrl: `${appOrigin()}/admin/${t.slug}/informes`,
    });
    if (await sendEmail({ to, ...msg })) sent++;
    else skipped++;
  }
  return { sent, skipped };
}
