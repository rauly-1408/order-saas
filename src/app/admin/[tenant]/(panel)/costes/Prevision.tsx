"use client";

import { useEffect, useMemo, useState } from "react";
import { shortfall, sumForecasts, type Forecast } from "@/app/lib/forecast";
import { formatQty, type Ingredient, type Overview } from "./types";

export type DraftOrder = { supplierId: string; lines: { ingredientId: string; quantity: string }[] };
type Props = { data: Overview; api: string; onOrder: (draft: DraftOrder) => void };

type Day = Forecast & { closed: boolean };
type Response = {
  today: string;
  days: Day[];
  yesterday: { ymd: string; forecastOrders: number; actualOrders: number; forecastItems: number; actualItems: number; accuracy: number | null } | null;
  historyDays: number;
};

const CARD = "rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const SAFETY_PCT = 10;
const TOP = 5; // platos visibles antes de «Ver todos»
const WEEKDAY = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

const dateLabel = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-ES", { ...opts, timeZone: "UTC" });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const wholeEuros = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
// Lo que hace falta, redondeado hacia arriba (no se piden 394,72 ml).
const needQty = (q: number, unit: Ingredient["baseUnit"]) => (unit === "KG" || unit === "L" ? Math.ceil(q * 10) / 10 : Math.ceil(q));

export default function Prevision({ data, api, onOrder }: Props) {
  const [res, setRes] = useState<Response | null>(null);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<number | "week">(1); // por defecto, mañana
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${api}/forecast`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error ?? "No se pudo calcular la previsión");
        if (alive) setRes(json as Response);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No se pudo calcular la previsión"));
    return () => {
      alive = false;
    };
  }, [api]);

  const productName = useMemo(() => new Map(data.categories.flatMap((c) => c.products.map((p) => [p.id, p.name]))), [data.categories]);
  const ingredients = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);

  if (error) return <div className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>;
  if (!res) return <div className="py-16 text-center text-[var(--p-muted)]">Calculando la previsión…</div>;

  const open = res.days.filter((d) => !d.closed);
  const day = sel === "week" ? null : res.days[sel];
  const view = day ? (day.closed ? null : day) : sumForecasts(open);

  if (res.historyDays === 0) {
    return (
      <div className={`${CARD} p-6 text-center`}>
        <p className="font-semibold">Aún no hay ventas para prever</p>
        <p className="mt-1 text-sm text-[var(--p-muted)]">La previsión sale de tus pedidos de las últimas 8 semanas. En cuanto tengas una semana de ventas, aparece aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={CARD} aria-labelledby="prev-title">
        <div className="px-5 pt-4">
          <h2 id="prev-title" className="text-[17px] font-semibold">Previsión de ventas</h2>
          <p className="mt-0.5 text-xs text-[var(--p-muted)]">
            Según los mismos días de la semana de las últimas 8 semanas.
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 px-4 pb-1" role="group" aria-label="Día">
          {res.days.map((d, i) => (
            <DayChip key={d.ymd} active={sel === i} onClick={() => setSel(i)} top={i === 0 ? "Hoy" : i === 1 ? "Mañana" : cap(dateLabel(d.ymd, { weekday: "short" }))} bottom={d.closed ? "Cerrado" : dateLabel(d.ymd, { day: "numeric", month: "short" })} muted={d.closed} />
          ))}
          <DayChip active={sel === "week"} onClick={() => setSel("week")} top="7 días" bottom="Para pedir" />
        </div>

        {res.yesterday && res.yesterday.accuracy != null && (
          <p className="mx-4 mt-3 rounded-xl bg-[var(--p-bg)] px-3 py-2 text-xs text-[var(--p-muted)]">
            Ayer se preveían <span className="font-semibold text-[var(--p-ink)]">{res.yesterday.forecastOrders} pedidos</span> y hubo{" "}
            <span className="font-semibold text-[var(--p-ink)]">{res.yesterday.actualOrders}</span> ·{" "}
            <span className={`font-semibold ${res.yesterday.accuracy >= 80 ? "text-emerald-700" : res.yesterday.accuracy >= 60 ? "text-amber-700" : "text-red-600"}`}>acierto {res.yesterday.accuracy} %</span>
          </p>
        )}

        {day?.closed ? (
          <p className="px-5 py-6 text-sm text-[var(--p-muted)]">Ese día está cerrado (por horario o por un cierre programado).</p>
        ) : (
          view && (
            <>
              {day && day.basedOn.length < 3 && (
                <p className="mx-4 mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {day.basedOn.length === 0
                    ? `No hay ventas de ningún ${WEEKDAY[day.isoWeekday - 1].replace(/s$/, "")} anterior: la previsión saldrá cuando tengas uno.`
                    : `Solo hay ${day.basedOn.length} ${day.basedOn.length === 1 ? WEEKDAY[day.isoWeekday - 1].replace(/s$/, "") : WEEKDAY[day.isoWeekday - 1]} con ventas: tómalo como orientación. Mejora cada semana.`}
                </p>
              )}
              {/* Las tres cifras en una sola franja: en el móvil no ocupan tres tarjetas. */}
              <div className="mx-4 mt-3 grid grid-cols-3 divide-x divide-[var(--p-line)] rounded-2xl bg-[var(--p-bg)] py-3 text-center">
                <Figure label="Pedidos" value={`≈ ${view.orders}`} />
                <Figure label="Platos" value={`≈ ${view.products.reduce((a, p) => a + p.units, 0)}`} />
                <Figure label="Ventas" value={`≈ ${wholeEuros(view.revenueCents)}`} />
              </div>
              <p className="px-5 pt-1.5 text-[11px] text-[var(--p-muted)]">
                {day
                  ? [
                      day.basedOn.length > 1 ? `Entre ${day.ordersMin} y ${day.ordersMax} pedidos` : null,
                      day.peakHour != null ? `más a las ${day.peakHour}:00` : null,
                      day.basedOn.length > 0 ? `según ${day.basedOn.length} ${day.basedOn.length === 1 ? WEEKDAY[day.isoWeekday - 1].replace(/s$/, "") : WEEKDAY[day.isoWeekday - 1]}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : `${open.length} días abiertos · ventas con IVA`}
              </p>

              <h3 className="px-5 pt-4 pb-1 text-[15px] font-semibold">Qué vas a vender</h3>
              {view.products.length === 0 ? (
                <p className="px-5 pb-4 text-sm text-[var(--p-muted)]">Sin datos para este día.</p>
              ) : (
                <ul className="divide-y divide-[var(--p-line)] border-t border-[var(--p-line)]">
                  {(showAll ? view.products : view.products.slice(0, TOP)).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0 truncate">{productName.get(p.id) ?? "Plato borrado"}</span>
                      <span className="shrink-0 tabular-nums">
                        {day && p.max > p.min && <span className="mr-2 text-[11px] text-[var(--p-muted)]">{p.min}–{p.max}</span>}
                        <span className="font-semibold">{p.units}</span>
                      </span>
                    </li>
                  ))}
                  {view.products.length > TOP && (
                    <li>
                      <button type="button" onClick={() => setShowAll(!showAll)} className="p-press min-h-11 w-full px-4 text-left text-sm font-semibold text-[var(--p-brand)]">
                        {showAll ? "Ver menos" : `Ver los ${view.products.length} platos`}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </>
          )
        )}
        <div className="h-2" />
      </section>

      {view && !day?.closed && <Needs need={view.ingredients} ingredients={ingredients} suppliers={data.suppliers} onOrder={onOrder} week={sel === "week"} />}
    </div>
  );
}

// Elaboraciones a preparar e ingredientes que hacen falta frente al stock.
function Needs({
  need,
  ingredients,
  suppliers,
  onOrder,
  week,
}: {
  need: Record<string, number>;
  ingredients: Map<string, Ingredient>;
  suppliers: Overview["suppliers"];
  onOrder: (d: DraftOrder) => void;
  week: boolean;
}) {
  const rows = Object.entries(need)
    .flatMap(([id, qty]) => {
      const i = ingredients.get(id);
      if (!i || i.isActive === false) return [];
      const lack = i.trackStock ? shortfall(qty, i.stockQty, SAFETY_PCT) : 0;
      return [{ i, qty, lack, order: lack > 0 && i.packSize > 0 ? Math.ceil(lack / i.packSize - 1e-9) * i.packSize : 0 }];
    })
    .sort((a, b) => Number(b.lack > 0) - Number(a.lack > 0) || a.i.name.localeCompare(b.i.name, "es"));
  const [showRest, setShowRest] = useState(false);
  const preps = rows.filter((r) => r.i.isPrep);
  // Lo urgente a la vista (lo que falta); lo que ya tienes o no controlas, plegado.
  const missing = rows.filter((r) => !r.i.isPrep && r.lack > 0);
  const rest = rows.filter((r) => !r.i.isPrep && r.lack <= 0);
  if (rows.length === 0) {
    return (
      <section className={`${CARD} p-5`}>
        <h3 className="text-[15px] font-semibold">Qué necesitas</h3>
        <p className="mt-1 text-sm text-[var(--p-muted)]">Haz el escandallo de tus platos para saber qué ingredientes y elaboraciones te harán falta.</p>
      </section>
    );
  }

  // Lo que falta, agrupado por proveedor, listo para pedir.
  const bySupplier = new Map<string, { ingredientId: string; quantity: string }[]>();
  for (const r of missing) if (r.order > 0 && r.i.supplierId) bySupplier.set(r.i.supplierId, [...(bySupplier.get(r.i.supplierId) ?? []), { ingredientId: r.i.id, quantity: String(r.order) }]);

  return (
    <section className={CARD} aria-labelledby="prev-needs">
      <div className="px-5 pt-4">
        <h3 id="prev-needs" className="text-[15px] font-semibold">Qué necesitas {week ? "para los próximos 7 días" : "ese día"}</h3>
        <p className="mt-0.5 text-xs text-[var(--p-muted)]">Según tus escandallos, con un {SAFETY_PCT} % de margen.</p>
      </div>

      {bySupplier.size > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {[...bySupplier].map(([sid, lines]) => (
            <button key={sid} type="button" onClick={() => onOrder({ supplierId: sid, lines })} className="p-press inline-flex min-h-11 items-center rounded-full bg-[var(--p-brand)] px-4 text-sm font-semibold text-white">
              Preparar pedido a {suppliers.find((s) => s.id === sid)?.name ?? "proveedor"}
            </button>
          ))}
        </div>
      )}

      {preps.length > 0 && <NeedList title="Elaboraciones a preparar" rows={preps} />}
      {missing.length > 0 ? (
        <NeedList title="Te falta" rows={missing} />
      ) : (
        rest.length > 0 && <p className="mx-4 mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">✓ Tienes los ingredientes que controlas</p>
      )}
      {rest.length > 0 && (
        <>
          <button type="button" aria-expanded={showRest} onClick={() => setShowRest(!showRest)} className="p-press mt-2 flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold text-[var(--p-brand)]">
            {showRest ? "Ocultar el resto" : `Ver los otros ${rest.length} ingredientes`}
            <span aria-hidden className={`transition-transform duration-200 ${showRest ? "rotate-90" : ""}`}>›</span>
          </button>
          {showRest && <NeedList title="Tienes o no controlas el stock" rows={rest} />}
        </>
      )}
      <div className="h-2" />
    </section>
  );
}

function NeedList({ title, rows }: { title: string; rows: { i: Ingredient; qty: number; lack: number; order: number }[] }) {
  return (
    <>
      <h4 className="mt-3 bg-[var(--p-bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--p-muted)]">{title}</h4>
      <ul className="divide-y divide-[var(--p-line)]">
        {rows.map(({ i, qty, lack, order }) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{i.name}</span>
              <span className="block text-xs text-[var(--p-muted)]">
                Necesitas <span className="font-semibold text-[var(--p-ink)]">{formatQty(needQty(qty, i.baseUnit), i.baseUnit)}</span>
                {i.trackStock ? ` · tienes ${formatQty(Math.max(i.stockQty, 0), i.baseUnit)}` : " · sin control de stock"}
              </span>
            </span>
            {i.trackStock &&
              (lack > 0 ? (
                <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
                  Faltan {formatQty(needQty(lack, i.baseUnit), i.baseUnit)}
                  {order > 0 && !i.isPrep && <span className="font-normal"> · pedir {formatQty(order, i.baseUnit)}</span>}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Tienes suficiente</span>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}

function DayChip({ active, onClick, top, bottom, muted }: { active: boolean; onClick: () => void; top: string; bottom: string; muted?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`p-press flex min-h-12 shrink-0 flex-col items-center justify-center rounded-2xl border px-3 py-1.5 text-center ${
        active ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)] text-[var(--p-brand)]" : "border-[var(--p-line)] text-[var(--p-ink)]"
      } ${muted && !active ? "opacity-50" : ""}`}
    >
      <span className="text-sm font-semibold">{top}</span>
      <span className="text-[11px] text-[var(--p-muted)]">{bottom}</span>
    </button>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-1">
      <div className="text-[11px] text-[var(--p-muted)]">{label}</div>
      <div className="truncate text-lg font-bold tabular-nums sm:text-2xl">{value}</div>
    </div>
  );
}
