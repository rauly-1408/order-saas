import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { getSession, requireManagerPage } from "@/app/lib/auth";
import { formatTimeIn, startOfTodayIn, tenantTimeZone } from "@/app/lib/time";
import CountUp from "../CountUp";
import GrowthCards from "./GrowthCards";
import { homeCards } from "./cards";

const STATUS: Record<string, { label: string; cls: string }> = {
  CREATED: { label: "Nuevo", cls: "bg-[var(--p-accent-soft)] text-[var(--p-accent)]" },
  ACCEPTED: { label: "Aceptado", cls: "bg-[var(--p-brand-soft)] text-[var(--p-brand)]" },
  PREPARING: { label: "Preparando", cls: "bg-amber-50 text-amber-700" },
  READY: { label: "Listo", cls: "bg-emerald-50 text-emerald-700" },
  DELIVERING: { label: "En reparto", cls: "bg-sky-50 text-sky-700" },
  DELIVERED: { label: "Entregado", cls: "bg-black/[0.04] text-[var(--p-muted)]" },
  CANCELLED: { label: "Cancelado", cls: "bg-black/[0.04] text-[var(--p-faint)] line-through" },
};

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

  const [ordersToday, activeOrders, products, categories, revenue, recentOrders, growth] = await Promise.all([
    prisma.order.count({ where: { tenantId, createdAt: { gte: today }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } } }),
    prisma.order.count({ where: { tenantId, status: { notIn: ["DELIVERED", "CANCELLED", "AWAITING_PAYMENT"] } } }),
    prisma.product.count({ where: { tenantId, isActive: true } }),
    prisma.category.count({ where: { tenantId, isActive: true } }),
    prisma.order.aggregate({ where: { tenantId, createdAt: { gte: today }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } }, _sum: { totalCents: true } }),
    prisma.order.findMany({
      where: { tenantId, status: { not: "AWAITING_PAYMENT" } },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, orderNumber: true, customerName: true, status: true, totalCents: true, channel: true, createdAt: true },
    }),
    homeCards(tenantId, tenant, timeZone),
  ]);

  const revenueCents = revenue._sum.totalCents ?? 0;
  const avgTicket = ordersToday ? Math.round(revenueCents / ordersToday) : 0;
  const dateLabel = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone }).format(new Date());
  const time = (d: Date) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone }).format(d);

  return (
    <>
      {/* Cabecera: identidad del restaurante + ingresos del día */}
      <section className="relative overflow-hidden rounded-[28px] bg-[var(--p-warm)] px-6 py-8 sm:px-10 sm:py-12">
        <p className="text-sm font-medium text-[var(--p-brand)]/70 first-letter:uppercase">{dateLabel}</p>
        <h1 className="p-display mt-2 text-5xl text-[var(--p-brand)] sm:text-7xl">
          Hoy en
          <br />
          {tenantData.name}
        </h1>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-[var(--p-brand)]/70">{canSeeTakings ? "Ingresos de hoy" : "Pedidos de hoy"}</p>
            <p className="text-4xl font-semibold tracking-tight text-[var(--p-brand)] sm:text-5xl">
              {canSeeTakings ? <CountUp value={revenueCents} format="euros" /> : <CountUp value={ordersToday} />}
            </p>
          </div>
          <p className="flex items-center gap-2 text-xs text-[var(--p-brand)]/60">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--p-brand)] opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--p-brand)]" />
            </span>
            Actualizado a las {formatTimeIn(timeZone)}
          </p>
        </div>
      </section>

      {/* Cifras clave */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Pedidos hoy" value={<CountUp value={ordersToday} />} />
        <Link href={`/admin/${tenant}/pedidos`} className="block">
          <Stat
            label="Activos ahora"
            value={<CountUp value={activeOrders} />}
            sub={activeOrders ? "Ver en Pedidos →" : "Nada pendiente"}
            urgent={activeOrders > 0}
          />
        </Link>
        {canSeeTakings ? <Stat label="Ticket medio hoy" value={<CountUp value={avgTicket} format="euros" />} /> : <Stat label="Categorías" value={<CountUp value={categories} />} sub="en la carta" />}
        <Stat label="Carta" value={<CountUp value={products} />} sub={`productos en ${categories} categorías`} />
      </section>

      {/* Ideas para personalizar la tienda (estilo Shopify) */}
      <GrowthCards tenant={tenant} cards={growth.cards} total={growth.total} insight={growth.insight} />

      {/* Últimos pedidos: lista agrupada al estilo iOS */}
      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="text-xl font-semibold">Últimos pedidos</h2>
          <Link href={`/admin/${tenant}/pedidos`} className="text-sm font-medium text-[var(--p-brand)] hover:underline">
            Ver todos
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="rounded-2xl bg-[var(--p-surface)] p-10 text-center text-sm text-[var(--p-muted)]">Todavía no hay pedidos.</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)] overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {recentOrders.map((o, i) => (
              <li key={o.id} className="p-rise flex items-center gap-4 px-5 py-4" style={{ "--i": i } as React.CSSProperties}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-sm font-semibold tabular-nums">
                  {o.orderNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{o.customerName}</p>
                  <p className="text-xs text-[var(--p-muted)]">
                    {o.channel === "DELIVERY" ? "A domicilio" : "Para recoger"} · {time(o.createdAt)}
                  </p>
                </div>
                <span className={`hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline ${STATUS[o.status]?.cls ?? ""}`}>
                  {STATUS[o.status]?.label ?? o.status}
                </span>
                <span className="w-20 text-right font-semibold tabular-nums">{euros(o.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value, sub, urgent = false }: { label: string; value: React.ReactNode; sub?: string; urgent?: boolean }) {
  return (
    <div
      className={`p-lift h-full rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        urgent ? "bg-[var(--p-accent)] text-white" : "bg-[var(--p-surface)]"
      }`}
    >
      <p className={`text-sm ${urgent ? "text-white/80" : "text-[var(--p-muted)]"}`}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      {sub && <p className={`mt-1 text-xs ${urgent ? "text-white/80" : "text-[var(--p-faint)]"}`}>{sub}</p>}
    </div>
  );
}
