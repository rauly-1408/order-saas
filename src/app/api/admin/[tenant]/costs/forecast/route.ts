import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";
import { accuracyPct, forecastDay, FORECAST_WEEKS, type DaySales } from "@/app/lib/forecast";
import { DAY_KEYS, hasSchedule, parseHours } from "@/app/lib/storeStatus";
import { addDays, localParts, startOfDayIn, tenantTimeZone } from "@/app/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAYS_AHEAD = 7;

// GET: previsión de ventas de hoy y los próximos 6 días a partir de los pedidos
// de las últimas semanas (mismo día de la semana). Ver lib/forecast.ts.
export async function GET(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const tz = tenantTimeZone(tenant?.settings);
  const now = new Date();
  const today = localParts(now, tz).ymd;
  // Una semana más de historial para poder comprobar la previsión de ayer.
  const from = startOfDayIn(tz, addDays(today, -7 * (FORECAST_WEEKS + 1)));

  const [orders, products, stores] = await Promise.all([
    prisma.order.findMany({
      where: { tenantId, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] }, createdAt: { gte: from, lt: startOfDayIn(tz, today) } },
      select: { createdAt: true, totalCents: true, items: { select: { productId: true, quantity: true, modifiers: true } } },
    }),
    prisma.product.findMany({
      where: { tenantId },
      select: {
        id: true,
        recipeLines: { select: { ingredientId: true, quantity: true } },
        modifierGroups: { select: { group: { select: { code: true, options: { select: { name: true, recipeLines: { select: { ingredientId: true, quantity: true } } } } } } } },
      },
    }),
    prisma.store.findMany({
      where: { tenantId },
      select: { openingHours: true, closures: { where: { endsAt: { gt: now } }, select: { startsAt: true, endsAt: true } } },
    }),
  ]);

  // Escandallo de cada plato y de cada opción (las opciones del pedido se guardan como {groupCode, option}).
  const recipe = new Map(products.map((p) => [p.id, p.recipeLines]));
  const optionRecipe = new Map(
    products.flatMap((p) => p.modifierGroups.flatMap((g) => g.group.options.map((o) => [`${p.id}::${g.group.code}::${o.name}`, o.recipeLines] as const)))
  );

  const byDay = new Map<string, DaySales>();
  for (const o of orders) {
    const { ymd, isoWeekday, hour } = localParts(o.createdAt, tz);
    const d = byDay.get(ymd) ?? { ymd, isoWeekday, orders: 0, revenueCents: 0, products: {}, ingredients: {}, hours: {} };
    d.orders += 1;
    d.revenueCents += o.totalCents;
    d.hours[hour] = (d.hours[hour] ?? 0) + 1;
    for (const it of o.items) {
      if (!it.productId) continue;
      d.products[it.productId] = (d.products[it.productId] ?? 0) + it.quantity;
      const lines = [...(recipe.get(it.productId) ?? [])];
      const mods = Array.isArray(it.modifiers) ? (it.modifiers as Record<string, unknown>[]) : [];
      for (const m of mods) {
        if (typeof m?.groupCode !== "string" || typeof m?.option !== "string") continue;
        lines.push(...(optionRecipe.get(`${it.productId}::${m.groupCode}::${m.option}`) ?? []));
      }
      for (const l of lines) if (l.quantity > 0) d.ingredients[l.ingredientId] = (d.ingredients[l.ingredientId] ?? 0) + l.quantity * it.quantity;
    }
    byDay.set(ymd, d);
  }
  const history = [...byDay.values()];

  // ¿Cerrado ese día? Todos los locales sin horario ese día o con un cierre que lo cubre entero.
  const closedOn = (ymd: string, isoWeekday: number) => {
    if (stores.length === 0) return false;
    const start = startOfDayIn(tz, ymd);
    const end = startOfDayIn(tz, addDays(ymd, 1));
    return stores.every((s) => {
      const h = parseHours(s.openingHours);
      const noHours = hasSchedule(h) && h[DAY_KEYS[isoWeekday - 1]].length === 0;
      const closure = s.closures.some((c) => c.startsAt <= start && c.endsAt >= end);
      return noHours || closure;
    });
  };

  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const ymd = addDays(today, i);
    const isoWeekday = weekdayOf(ymd);
    return { ...forecastDay(history, ymd, isoWeekday), closed: closedOn(ymd, isoWeekday) };
  });

  // Comprobación: lo que habríamos previsto ayer frente a lo que se vendió.
  const y = addDays(today, -1);
  const actual = byDay.get(y);
  const predicted = forecastDay(history, y, weekdayOf(y));
  const items = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);
  const yesterday =
    actual && predicted.basedOn.length > 0
      ? {
          ymd: y,
          forecastOrders: predicted.orders,
          actualOrders: actual.orders,
          forecastItems: predicted.products.reduce((a, p) => a + p.units, 0),
          actualItems: items(actual.products),
          accuracy: accuracyPct(predicted.orders, actual.orders),
        }
      : null;

  return NextResponse.json({ today, days, yesterday, historyDays: history.length });
}

// Día ISO (1 = lunes) de una fecha AAAA-MM-DD (calendario puro).
function weekdayOf(ymd: string): number {
  const d = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return ((d + 6) % 7) + 1;
}
