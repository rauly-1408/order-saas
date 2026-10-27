import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { getSession, requireManagerPage } from "@/app/lib/auth";
import { formatTimeIn, startOfTodayIn, tenantTimeZone } from "@/app/lib/time";
import CountUp from "../CountUp";
import GrowthCards from "./GrowthCards";
import { homeCards } from "./cards";
import HourlyBars, { type HourBucket } from "./HourlyBars";

const STATUS: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "Nuevo", cls: "bg-[var(--p-accent-soft)] text-[var(--p-accent)]" },
  ACCEPTED: { label: "Aceptado", cls: "bg-[var(--p-brand-soft)] text-[var(--p-brand)]" },
  PREPARING: { label: "Preparando", cls: "bg-amber-50 text-amber-700" },
  READY: { label: "Listo", cls: "bg-emerald-50 text-emerald-700" },
  DELIVERING: { label: "En reparto", cls: "bg-sky-50 text-sky-700" },
  DELIVERED: { label: "Entregado", cls: "bg-black/[0.04] text-[var(--p-muted)]" },
  CANCELLED: { label: "Cancelado", cls: "bg-red-50 text-red-600" },
};

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

const euros = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function AdminHomePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant); // Inicio muestra ingresos: solo dueño/superadmin
  const canSeeTakings = Boolean((await getSession())?.seesTakings); // permiso «Ve lo recaudado»

  const tenantData = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { id: true, name: true, settings: true },
  });
  if (!tenantData) return <p className="text-[var(--p-accent)]">Restaurante no encontrado: {tenant}</p>;

  // "Hoy" en la zona horaria del restaurante (el servidor trabaja en UTC).
  const timeZone = tenantTimeZone(tenantData.settings);
  const today = startOfTodayIn(timeZone);
  const tenantId = tenantData.id;

  const now = new Date();
  const lastWeekStart = new Date(today.getTime() - WEEK_MS);
  const lastWeekNow = new Date(now.getTime() - WEEK_MS);
  const sold = { notIn: ["CANCELLED", "AWAITING_PAYMENT"] as ("CANCELLED" | "AWAITING_PAYMENT")[] };

  const [ordersToday, activeOrders, products, categories, todaysOrders, lastWeek, recentOrders, growth] = await Promise.all([
    prisma.order.count({ where: { tenantId, createdAt: { gte: today }, status: sold } }),
    prisma.order.count({ where: { tenantId, status: { notIn: ["DELIVERED", "CANCELLED", "AWAITING_PAYMENT"] } } }),
    prisma.product.count({ where: { tenantId, isActive: true } }),
    prisma.category.count({ where: { tenantId, isActive: true } }),
    prisma.order.findMany({ where: { tenantId, createdAt: { gte: today }, status: sold }, select: { createdAt: true, totalCents: true } }),
    // El mismo día de la semana pasada, hasta la misma hora: para comparar.
    prisma.order.aggregate({ where: { tenantId, createdAt: { gte: lastWeekStart, lte: lastWeekNow }, status: sold }, _sum: { totalCents: true }, _count: true }),
    prisma.order.findMany({
      where: { tenantId, status: { not: "AWAITING_PAYMENT" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, orderNumber: true, customerName: true, status: true, totalCents: true, channel: true, source: true, dineIn: true, createdAt: true },
    }),
    homeCards(tenantId, tenant, timeZone),
  ]);

  const revenueCents = todaysOrders.reduce((s, o) => s + o.totalCents, 0);
  const avgTicket = ordersToday ? Math.round(revenueCents / ordersToday) : 0;
  const dateLabel = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now);
  const weekday = new Intl.DateTimeFormat("es-ES", { weekday: "long", timeZone }).format(now);
  const hourOf = (d: Date) => Number(new Intl.DateTimeFormat("es-ES", { hour: "numeric", hourCycle: "h23", timeZone }).format(d));
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
  const time = (d: Date) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone }).format(d);
  const when = (d: Date) => {
    if (dayKey(d) === dayKey(now)) return time(d);
    if (dayKey(d) === dayKey(new Date(now.getTime() - DAY_MS))) return `ayer, ${time(d)}`;
    return `${new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", timeZone }).format(d)}, ${time(d)}`;
  };

  // Ventas por hora de hoy: de las 9 h (o antes, si hubo pedidos) a medianoche.
  const nowHour = hourOf(now);
  const firstHour = Math.min(9, ...todaysOrders.map((o) => hourOf(o.createdAt)));
  const buckets: HourBucket[] = Array.from({ length: 24 - firstHour }, (_, i) => ({ hour: firstHour + i, orders: 0, cents: 0 }));
  for (const o of todaysOrders) {
    const b = buckets[hourOf(o.createdAt) - firstHour];
    b.orders += 1;
    b.cents += o.totalCents;
  }

  // Comparación con el mismo día de la semana pasada a esta hora.
  const nowValue = canSeeTakings ? revenueCents : ordersToday;
  const pastValue = canSeeTakings ? (lastWeek._sum.totalCents ?? 0) : lastWeek._count;
  const deltaPct = pastValue > 0 ? Math.round(((nowValue - pastValue) / pastValue) * 100) : null;
  const pastText = canSeeTakings ? euros(pastValue) : `${pastValue} ${pastValue === 1 ? "pedido" : "pedidos"}`;

  return (
    <>
      {/* Cabecera: el día y el restaurante */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--p-muted)] first-letter:uppercase">{dateLabel}</p>
          <h1 className="p-display mt-1 text-4xl leading-[0.95] text-[var(--p-brand)] sm:text-5xl">Hoy en {tenantData.name}</h1>
        </div>
        <p className="flex items-center gap-2 pb-1 text-xs text-[var(--p-muted)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-50 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          En directo · {formatTimeIn(timeZone)}
        </p>
      </header>

      {/* Lo más importante: cuánto llevamos hoy y a qué horas */}
      <section className="mt-5 grid gap-6 overflow-hidden rounded-[28px] bg-[var(--p-warm)] p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-end lg:gap-10">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--p-brand)]/70">{canSeeTakings ? "Ingresos de hoy" : "Pedidos de hoy"}</p>
          <p className="mt-1 text-5xl font-semibold tracking-[-0.03em] text-[var(--p-brand)] tabular-nums sm:text-6xl">
            {canSeeTakings ? <CountUp value={revenueCents} format="euros" /> : <CountUp value={ordersToday} />}
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--p-brand)]/75">
            {deltaPct !== null && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${deltaPct >= 0 ? "bg-emerald-600/10 text-emerald-700" : "bg-red-600/10 text-red-700"}`}>
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)} %
              </span>
            )}
            <span>
              El {weekday} pasado a esta hora: <b className="font-semibold tabular-nums">{pastText}</b>
            </span>
          </p>
        </div>
        <HourlyBars buckets={buckets} nowHour={nowHour} money={canSeeTakings} />
      </section>

      {/* Cifras clave: una sola tarjeta, cada cifra lleva a su pantalla */}
      <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-[var(--p-line)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:grid-cols-4">
        <Stat href={`/admin/${tenant}/pedidos`} label="Pedidos hoy" value={<CountUp value={ordersToday} />} sub="Ver pedidos" />
        <Stat href={`/admin/${tenant}/pedidos`} label="Activos ahora" value={<CountUp value={activeOrders} />} sub={activeOrders ? "Atender ahora" : "Nada pendiente"} urgent={activeOrders > 0} />
        {canSeeTakings ? (
          <Stat href={`/admin/${tenant}/informes`} label="Ticket medio hoy" value={<CountUp value={avgTicket} format="euros" />} sub="Ver informes" />
        ) : (
          <Stat href={`/admin/${tenant}/carta`} label="Categorías" value={<CountUp value={categories} />} sub="en la carta" />
        )}
        <Stat href={`/admin/${tenant}/carta`} label="Productos en carta" value={<CountUp value={products} />} sub={`en ${categories} categorías`} />
      </section>

      {/* Ideas para personalizar la tienda (estilo Shopify) */}
      <GrowthCards tenant={tenant} cards={growth.cards} total={growth.total} insight={growth.insight} />

      {/* Últimos pedidos: lista agrupada al estilo iOS */}
      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-xl font-semibold tracking-tight">Últimos pedidos</h2>
          <Link href={`/admin/${tenant}/pedidos`} className="text-sm font-medium text-[var(--p-brand)] hover:underline">
            Ver todos ›
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="rounded-2xl bg-[var(--p-surface)] p-10 text-center text-sm text-[var(--p-muted)]">Todavía no hay pedidos.</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)] overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {recentOrders.map((o, i) => {
              const st = STATUS[o.status];
              const cancelled = o.status === "CANCELLED";
              return (
                <li key={o.id} className="p-rise" style={{ "--i": i } as React.CSSProperties}>
                  <Link href={`/admin/${tenant}/pedidos`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.025] sm:gap-4 sm:px-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-[13px] font-semibold tabular-nums text-[var(--p-muted)]">
                      {o.orderNumber}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-[15px] font-medium ${cancelled ? "text-[var(--p-muted)]" : ""}`}>{o.customerName}</p>
                      <p className="truncate text-xs text-[var(--p-muted)]">
                        {modeOf(o)} · {when(o.createdAt)}
                      </p>
                    </div>
                    <span className={`hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium min-[400px]:inline-flex ${st?.cls ?? ""}`}>
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                      {st?.label ?? o.status}
                    </span>
                    <span className={`w-[4.5rem] shrink-0 text-right text-[15px] font-semibold tabular-nums sm:w-20 ${cancelled ? "text-[var(--p-faint)] line-through decoration-1" : ""}`}>{euros(o.totalCents)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// Cómo es el pedido: los de mesa no son «para recoger».
function modeOf(o: { channel: string; source: string; dineIn: boolean }): string {
  if (o.source === "TABLE") return "En sala";
  if (o.channel === "DELIVERY") return "A domicilio";
  if (o.dineIn) return "Comer aquí";
  return o.source === "ONLINE" ? "Para recoger" : "Para llevar";
}

function Stat({ label, value, sub, urgent = false, href }: { label: string; value: React.ReactNode; sub?: string; urgent?: boolean; href?: string }) {
  const body = (
    <div className={`group flex h-full flex-col bg-[var(--p-surface)] p-5 transition-colors ${href ? "hover:bg-[color-mix(in_srgb,var(--p-surface)_96%,black)]" : ""}`}>
      <p className="flex items-center gap-2 text-sm text-[var(--p-muted)]">
        {urgent && (
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--p-accent)] opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--p-accent)]" />
          </span>
        )}
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${urgent ? "text-[var(--p-accent)]" : ""}`}>{value}</p>
      {sub && (
        <p className={`mt-auto flex items-center justify-between gap-2 pt-2 text-xs ${urgent ? "font-semibold text-[var(--p-accent)]" : "text-[var(--p-faint)]"}`}>
          <span className="truncate">{sub}</span>
          {href && <span aria-hidden className="text-base leading-none transition-transform group-hover:translate-x-0.5">›</span>}
        </p>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}
