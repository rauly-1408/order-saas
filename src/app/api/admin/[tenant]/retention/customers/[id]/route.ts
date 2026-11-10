import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";
import { getSessionFromRequest } from "@/app/lib/auth";
import { daysSince, type Segment } from "@/app/lib/retention";
import { modifierLabels } from "@/app/lib/menuOptions";
import { tenantTimeZone } from "@/app/lib/time";
import { recommendOffer } from "@/app/lib/customerOffer";

const DAYS = ["los domingos", "los lunes", "los martes", "los miércoles", "los jueves", "los viernes", "los sábados"];
const PAY: Record<string, string> = { CASH: "Efectivo", CARD_TERMINAL: "Datáfono", BIZUM: "Bizum", CARD: "Tarjeta online", IN_STORE: "Al recoger" };

// GET /api/admin/[tenant]/retention/customers/[id] → la ficha del cliente: sus
// pedidos (por su ficha o por su teléfono), resumen, lo que más pide y la
// oferta recomendada. Ver docs/CLIENTES.md
export async function GET(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  const c = await prisma.customer.findFirst({ where: { id, tenantId: ctx.tenant.id } });
  if (!c) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  const sees = Boolean((await getSessionFromRequest(req))?.seesTakings);
  const t = await prisma.tenant.findUnique({ where: { id: ctx.tenant.id }, select: { settings: true } });
  const tz = tenantTimeZone(t?.settings);
  const orders = await prisma.order.findMany({
    where: { tenantId: ctx.tenant.id, status: { notIn: ["AWAITING_PAYMENT"] }, OR: [{ customerId: c.id }, ...(c.phone ? [{ customerPhone: c.phone }] : [])] },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, orderNumber: true, createdAt: true, status: true, totalCents: true, paymentMethod: true, paymentStatus: true, cashPartCents: true, channel: true, dineIn: true, source: true, notes: true, customerAddress: true, items: { select: { productName: true, quantity: true, totalCents: true, modifiers: true, note: true } } },
  });
  const valid = orders.filter((o) => o.status !== "CANCELLED");
  const spent = valid.reduce((a, o) => a + o.totalCents, 0);
  const products = new Map<string, number>();
  const pays = new Map<string, number>();
  const dayHour = new Map<string, number>();
  let online = 0;
  const fmtParts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", hour12: false });
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  for (const o of valid) {
    for (const l of o.items) products.set(l.productName, (products.get(l.productName) ?? 0) + l.quantity);
    if (o.paymentStatus === "PAID") pays.set(o.paymentMethod, (pays.get(o.paymentMethod) ?? 0) + 1);
    if (o.source === "ONLINE") online++;
    const parts = Object.fromEntries(fmtParts.formatToParts(o.createdAt).map((p) => [p.type, p.value]));
    const key = `${WD[parts.weekday as string]}-${Number(parts.hour)}`;
    dayHour.set(key, (dayHour.get(key) ?? 0) + 1);
  }
  const top = [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }));
  const usual = valid.length >= 2 ? [...dayHour.entries()].sort((a, b) => b[1] - a[1])[0] : null;
  const usualDay = usual && usual[1] >= 2 ? DAYS[Number(usual[0].split("-")[0])] : null;
  const usualHour = usual && usual[1] >= 2 ? Number(usual[0].split("-")[1]) : null;
  const last = valid[0]?.createdAt ?? c.lastOrderAt ?? null;
  const offer = recommendOffer({
    name: c.name,
    segment: c.segment as Segment,
    orders: valid.length,
    avgTicketCents: valid.length ? Math.round(spent / valid.length) : 0,
    daysSinceLast: daysSince(last),
    favourite: top[0]?.name ?? null,
    usualDay,
    usualHour,
  });
  offer.message = offer.message.replace("{restaurante}", ctx.tenant.name);
  return NextResponse.json({
    customer: { id: c.id, name: c.name, phone: c.phone, email: c.email, segment: c.segment, marketingConsent: c.marketingConsent, firstOrderAt: c.firstOrderAt, notes: c.notes },
    summary: {
      orders: valid.length,
      cancelled: orders.length - valid.length,
      spentCents: sees ? spent : null,
      avgTicketCents: sees && valid.length ? Math.round(spent / valid.length) : null,
      daysSinceLast: daysSince(last),
      online,
      inStore: valid.length - online,
      payments: [...pays.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => ({ label: PAY[m] ?? m, count: n })),
      usual: usualDay && usualHour != null ? `${usualDay}, hacia las ${String(usualHour).padStart(2, "0")}:00` : null,
    },
    top,
    offer,
    orders: orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      cancelled: o.status === "CANCELLED",
      totalCents: sees ? o.totalCents : null,
      payment: o.paymentStatus === "PAID" ? (o.cashPartCents && o.paymentMethod !== "CASH" ? "Mixto" : (PAY[o.paymentMethod] ?? o.paymentMethod)) : o.paymentStatus === "REFUNDED" ? "Devuelto" : "Sin cobrar",
      how: `${o.source === "ONLINE" ? "Online" : o.source === "TABLE" ? "En mesa" : o.source === "PHONE" ? "Por teléfono" : "Mostrador"} · ${o.channel === "DELIVERY" ? "a domicilio" : o.dineIn ? "comer aquí" : "para llevar"}`,
      notes: o.notes,
      address: o.customerAddress,
      lines: o.items.map((l) => ({ name: l.productName, quantity: l.quantity, totalCents: sees ? l.totalCents : null, modifiers: modifierLabels(l.modifiers), note: l.note })),
    })),
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/[tenant]/retention/customers/[id]  { marketingConsent: false }
// Solo permite DAR DE BAJA (p. ej. el cliente respondió "BAJA"). El alta la da
// únicamente el propio cliente al marcar la casilla en el checkout (RGPD).
export async function PATCH(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  const body = (await req.json().catch(() => null)) as { marketingConsent?: unknown } | null;
  if (body?.marketingConsent !== false) {
    return NextResponse.json({ error: "Solo el cliente puede dar su consentimiento, desde el checkout" }, { status: 400 });
  }
  const result = await prisma.customer.updateMany({
    where: { id, tenantId: ctx.tenant.id },
    data: { marketingConsent: false, marketingConsentAt: null },
  });
  if (result.count === 0) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  // Los envíos pendientes a este cliente se descartan.
  await prisma.campaignSend.updateMany({ where: { customerId: id, status: "PENDING" }, data: { status: "FAILED" } });
  return NextResponse.json({ ok: true });
}
