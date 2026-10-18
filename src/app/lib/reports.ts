// Informes de ventas (panel → Informes). Agregación pura: recibe los pedidos de
// un periodo y devuelve cifras, series y rankings en la hora del restaurante.
import { addDays, daysBetween, localParts } from "@/app/lib/time";
import { includedTax } from "@/app/lib/storePolicies";

export type ReportOrder = {
  createdAt: Date;
  status: string;
  channel: string;
  totalCents: number;
  discountCents: number;
  feesCents: number;
  couponCode: string | null;
  promotionName?: string | null;
  promotionDiscountCents?: number;
  loyaltyDiscountCents?: number;
  tipCents?: number;
  giftCardCents?: number;
  customerId: string | null;
  customerFirstOrderAt: Date | null;
  lines: { productId: string; productName: string; categoryName: string | null; quantity: number; totalCents: number }[];
};

export type Totals = {
  revenueCents: number; // total cobrado (IVA incl., con envío, tras descuentos)
  orders: number;
  avgTicketCents: number;
  discountCents: number;
  deliveryFeesCents: number;
  newCustomers: number;
  cancelled: number;
  // IVA incluido en las ventas de comida (sin propinas; con lo pagado con tarjeta regalo)
  taxCents: number;
  taxRate: number;
  tipsCents: number;
};

export type Report = {
  from: string;
  to: string;
  totals: Totals;
  previous: Totals;
  byDay: { date: string; revenueCents: number; orders: number }[];
  byChannel: { channel: "DELIVERY" | "TAKEAWAY"; orders: number; revenueCents: number }[];
  topProducts: { name: string; quantity: number; revenueCents: number }[];
  topCategories: { name: string; quantity: number; revenueCents: number }[];
  heatmap: number[][]; // [día ISO 0-6 (lun-dom)][hora 0-23] → nº de pedidos
  ordersWithDiscount: number;
  coupons: { code: string; uses: number; discountCents: number }[]; // cupones, promociones (🏷️) y premio de fidelidad (🎁)
};

export const MAX_RANGE_DAYS = 366;

function totalsOf(orders: ReportOrder[], from: Date, to: Date, taxRate: number): Totals {
  const valid = orders.filter((o) => o.status !== "CANCELLED");
  const revenueCents = valid.reduce((a, o) => a + o.totalCents, 0);
  const newCustomers = new Set(
    valid.filter((o) => o.customerId && o.customerFirstOrderAt && o.customerFirstOrderAt >= from && o.customerFirstOrderAt < to).map((o) => o.customerId)
  ).size;
  return {
    revenueCents,
    orders: valid.length,
    avgTicketCents: valid.length ? Math.round(revenueCents / valid.length) : 0,
    discountCents: valid.reduce((a, o) => a + o.discountCents, 0),
    deliveryFeesCents: valid.reduce((a, o) => a + (o.channel === "DELIVERY" ? o.feesCents : 0), 0),
    newCustomers,
    cancelled: orders.length - valid.length,
    taxCents: includedTax(valid.reduce((a, o) => a + o.totalCents + (o.giftCardCents ?? 0) - (o.tipCents ?? 0), 0), taxRate),
    taxRate,
    tipsCents: valid.reduce((a, o) => a + (o.tipCents ?? 0), 0),
  };
}

function rank(map: Map<string, { quantity: number; revenueCents: number }>, limit: number) {
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenueCents - a.revenueCents || b.quantity - a.quantity)
    .slice(0, limit);
}

// `current` y `previous` ya vienen filtrados por fecha; los límites (instantes UTC)
// sirven para decidir qué clientes son nuevos en cada periodo.
export function buildReport(
  current: ReportOrder[],
  previous: ReportOrder[],
  range: { from: string; to: string; start: Date; end: Date; prevStart: Date },
  timeZone: string,
  taxRate = 10
): Report {
  const valid = current.filter((o) => o.status !== "CANCELLED");

  const days = daysBetween(range.from, range.to) + 1;
  const byDayMap = new Map<string, { revenueCents: number; orders: number }>();
  for (let i = 0; i < days; i++) byDayMap.set(addDays(range.from, i), { revenueCents: 0, orders: 0 });

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  const channels = new Map<string, { orders: number; revenueCents: number }>();
  const products = new Map<string, { quantity: number; revenueCents: number }>();
  const categories = new Map<string, { quantity: number; revenueCents: number }>();
  const coupons = new Map<string, { uses: number; discountCents: number }>();

  for (const o of valid) {
    const p = localParts(o.createdAt, timeZone);
    const day = byDayMap.get(p.ymd);
    if (day) {
      day.revenueCents += o.totalCents;
      day.orders += 1;
    }
    heatmap[p.isoWeekday - 1][p.hour] += 1;
    const ch = channels.get(o.channel) ?? { orders: 0, revenueCents: 0 };
    channels.set(o.channel, { orders: ch.orders + 1, revenueCents: ch.revenueCents + o.totalCents });
    const promoCents = o.promotionDiscountCents ?? 0;
    const loyaltyCents = o.loyaltyDiscountCents ?? 0;
    const discounts: [string | null | undefined, number][] = [
      [o.couponCode, o.discountCents - promoCents - loyaltyCents],
      [o.promotionName ? `🏷️ ${o.promotionName}` : null, promoCents],
      [loyaltyCents > 0 ? "🎁 Premio de fidelidad" : null, loyaltyCents],
    ];
    for (const [key, cents] of discounts) {
      if (!key) continue;
      const c = coupons.get(key) ?? { uses: 0, discountCents: 0 };
      coupons.set(key, { uses: c.uses + 1, discountCents: c.discountCents + cents });
    }
    for (const l of o.lines) {
      const pr = products.get(l.productName) ?? { quantity: 0, revenueCents: 0 };
      products.set(l.productName, { quantity: pr.quantity + l.quantity, revenueCents: pr.revenueCents + l.totalCents });
      const cat = l.categoryName ?? "Sin categoría";
      const ca = categories.get(cat) ?? { quantity: 0, revenueCents: 0 };
      categories.set(cat, { quantity: ca.quantity + l.quantity, revenueCents: ca.revenueCents + l.totalCents });
    }
  }

  return {
    from: range.from,
    to: range.to,
    totals: totalsOf(current, range.start, range.end, taxRate),
    previous: totalsOf(previous, range.prevStart, range.start, taxRate),
    byDay: [...byDayMap.entries()].map(([date, v]) => ({ date, ...v })),
    byChannel: (["DELIVERY", "TAKEAWAY"] as const).map((channel) => ({ channel, ...(channels.get(channel) ?? { orders: 0, revenueCents: 0 }) })),
    topProducts: rank(products, 10),
    topCategories: rank(categories, 8),
    heatmap,
    ordersWithDiscount: valid.filter((o) => o.discountCents > 0).length,
    coupons: [...coupons.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => b.uses - a.uses),
  };
}

// Variación porcentual entre periodos (null si no hay base para comparar).
export function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

// CSV para Excel en español: separador ";", coma decimal y BOM para los acentos.
export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
