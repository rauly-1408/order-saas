"use client";

import { useEffect, useMemo, useState } from "react";
import type { Report, Totals } from "@/app/lib/reports";
import { changePct } from "@/app/lib/reports";
import { addDays, daysBetween } from "@/app/lib/time";
import { readPanelCache, writePanelCache } from "../panelCache";

// Informes de ventas: cifras clave frente al periodo anterior, ventas por día,
// lo más vendido, horas punta, canal, cupones y exportación a Excel (CSV).

type Preset = "today" | "7d" | "30d" | "month" | "prevMonth" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "month", label: "Este mes" },
  { key: "prevMonth", label: "Mes anterior" },
  { key: "custom", label: "Personalizado" },
];

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const eur = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const eurShort = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: cents >= 100000 ? 0 : 2 });
const dayLabel = (ymd: string, opts: Intl.DateTimeFormatOptions) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-ES", { ...opts, timeZone: "UTC" });

function rangeFor(preset: Exclude<Preset, "custom">, today: string): { from: string; to: string } {
  const monthStart = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: monthStart, to: today };
    case "prevMonth": {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
  }
}

export default function InformesClient({ tenant, today }: { tenant: string; today: string }) {
  const [preset, setPreset] = useState<Preset>("7d");
  const [range, setRange] = useState(() => rangeFor("7d", today));
  const [draft, setDraft] = useState(range);
  const key = `informes:${tenant}:${range.from}:${range.to}`;
  const [report, setReport] = useState<Report | null>(() => readPanelCache<Report>(key) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = `from=${range.from}&to=${range.to}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/${tenant}/reports?${query}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "No se pudo cargar el informe");
        return json.report as Report;
      })
      .then((r) => {
        if (cancelled) return;
        writePanelCache(key, r);
        setReport(r);
        setError("");
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "No se pudo cargar el informe"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tenant, query, key]);

  function choose(p: Preset) {
    setPreset(p);
    if (p === "custom") return;
    const r = rangeFor(p, today);
    change(r);
  }

  function change(r: { from: string; to: string }) {
    setRange(r);
    setDraft(r);
    setLoading(true);
    setReport(readPanelCache<Report>(`informes:${tenant}:${r.from}:${r.to}`) ?? report);
  }

  const draftValid = draft.from && draft.to && daysBetween(draft.from, draft.to) >= 0 && daysBetween(draft.from, draft.to) < 366;
  const days = daysBetween(range.from, range.to) + 1;

  return (
    <div className="text-[var(--p-ink)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Informes</h1>
          <p className="mt-1 text-sm text-[var(--p-muted)]">
            {range.from === range.to
              ? dayLabel(range.from, { weekday: "long", day: "numeric", month: "long" })
              : `${dayLabel(range.from, { day: "numeric", month: "short", year: "numeric" })} – ${dayLabel(range.to, { day: "numeric", month: "short", year: "numeric" })}`}
            {" · "}comparado con {days === 1 ? "el día anterior" : `los ${days} días anteriores`}
          </p>
        </div>
        <a
          href={`/api/admin/${tenant}/reports/export?${query}`}
          className="p-press inline-flex w-fit items-center gap-2 rounded-full border border-[var(--p-line)] px-4 py-1.5 text-sm font-semibold hover:bg-black/[0.04]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          Exportar a Excel
        </a>
      </div>

      <nav className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1" aria-label="Periodo">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => choose(p.key)}
            aria-pressed={preset === p.key}
            className={`p-press shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-300 ${
              preset === p.key ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)] hover:text-[var(--p-ink)]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      {preset === "custom" && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draftValid) change(draft);
          }}
        >
          <label className="text-xs text-[var(--p-muted)]">
            Desde
            <input type="date" value={draft.from} max={today} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className="mt-1 block rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-1.5 text-sm text-[var(--p-ink)]" />
          </label>
          <label className="text-xs text-[var(--p-muted)]">
            Hasta
            <input type="date" value={draft.to} max={today} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className="mt-1 block rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-1.5 text-sm text-[var(--p-ink)]" />
          </label>
          <button disabled={!draftValid} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
            Ver informe
          </button>
          {!draftValid && <p className="basis-full text-xs text-[var(--p-muted)]">Elige un periodo de como máximo un año, con la fecha de inicio antes que la de fin.</p>}
        </form>
      )}

      {error && <div className="mt-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>}

      {!report ? (
        !error && <div className="py-16 text-center text-[var(--p-muted)]">Cargando…</div>
      ) : (
        <div className={`mt-6 space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <Kpis totals={report.totals} previous={report.previous} />
          <SalesByDay report={report} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking title="Productos más vendidos" rows={report.topProducts} empty="Aún no hay productos vendidos en este periodo" />
            <Ranking title="Categorías" rows={report.topCategories} empty="Aún no hay ventas en este periodo" />
          </div>
          <Heatmap heatmap={report.heatmap} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Channels report={report} />
            <Coupons report={report} />
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ── Cifras clave ────────────────────────────────────────────────────────
function Kpis({ totals, previous }: { totals: Totals; previous: Totals }) {
  const tiles: { label: string; value: string; cur: number; prev: number; lowerIsBetter?: boolean }[] = [
    { label: "Ventas", value: eur(totals.revenueCents), cur: totals.revenueCents, prev: previous.revenueCents },
    { label: "Pedidos", value: String(totals.orders), cur: totals.orders, prev: previous.orders },
    { label: "Ticket medio", value: eur(totals.avgTicketCents), cur: totals.avgTicketCents, prev: previous.avgTicketCents },
    { label: "Clientes nuevos", value: String(totals.newCustomers), cur: totals.newCustomers, prev: previous.newCustomers },
    { label: "Descuentos", value: eur(totals.discountCents), cur: totals.discountCents, prev: previous.discountCents, lowerIsBetter: true },
    { label: totals.cancelledByCustomer > 0 ? `Cancelados · ${totals.cancelledByCustomer} por el cliente` : "Cancelados", value: String(totals.cancelled), cur: totals.cancelled, prev: previous.cancelled, lowerIsBetter: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => {
        const pct = changePct(t.cur, t.prev);
        const good = pct == null || pct === 0 ? null : (pct > 0) !== Boolean(t.lowerIsBetter);
        return (
          <div key={t.label} className="min-w-0 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="text-xs text-[var(--p-muted)]">{t.label}</p>
            <p className="mt-1 truncate text-xl font-semibold tabular-nums sm:text-2xl">{t.value}</p>
            <p className="mt-1 text-xs tabular-nums">
              {pct == null ? (
                <span className="text-[var(--p-muted)]">{t.prev === 0 && t.cur > 0 ? "Nuevo en este periodo" : "Sin datos para comparar"}</span>
              ) : (
                <>
                  <span className={good == null ? "text-[var(--p-muted)]" : good ? "font-semibold text-emerald-700" : "font-semibold text-[var(--p-accent)]"}>
                    {pct > 0 ? "▲" : pct < 0 ? "▼" : "="} {Math.abs(pct).toLocaleString("es-ES", { maximumFractionDigits: 0 })}%
                  </span>{" "}
                  <span className="text-[var(--p-muted)]">vs anterior</span>
                </>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Ventas por día (por semana si el periodo es largo) ──────────────────
function SalesByDay({ report }: { report: Report }) {
  const weekly = report.byDay.length > 62;
  const bars = useMemo(() => {
    if (!weekly) return report.byDay.map((d) => ({ ...d, label: dayLabel(d.date, { weekday: "long", day: "numeric", month: "short" }) }));
    const out: { date: string; revenueCents: number; orders: number; label: string }[] = [];
    report.byDay.forEach((d, i) => {
      if (i % 7 === 0) out.push({ date: d.date, revenueCents: 0, orders: 0, label: `Semana del ${dayLabel(d.date, { day: "numeric", month: "short" })}` });
      const w = out[out.length - 1];
      w.revenueCents += d.revenueCents;
      w.orders += d.orders;
    });
    return out;
  }, [report.byDay, weekly]);
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.revenueCents), 1);
  const shown = active != null ? bars[active] : null;
  const showTicks = bars.length <= 14;

  return (
    <Card title={weekly ? "Ventas por semana" : "Ventas por día"}>
      <p className="mb-3 min-h-5 text-sm tabular-nums">
        {shown ? (
          <>
            <span className="text-[var(--p-muted)]">{shown.label} · </span>
            <span className="font-semibold">{eur(shown.revenueCents)}</span>
            <span className="text-[var(--p-muted)]"> · {shown.orders} {shown.orders === 1 ? "pedido" : "pedidos"}</span>
          </>
        ) : (
          <span className="text-[var(--p-muted)]">Pasa el dedo o el ratón por las barras para ver el detalle · máximo {eur(max === 1 ? 0 : max)}</span>
        )}
      </p>
      <div className="flex h-44 items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
        {bars.map((b, i) => (
          <button
            key={b.date}
            type="button"
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(i)}
            aria-label={`${b.label}: ${eur(b.revenueCents)}, ${b.orders} pedidos`}
            className="group flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={`block w-full rounded-t-[4px] transition-opacity ${b.revenueCents ? "bg-[var(--p-brand)]" : "bg-black/[0.06]"} ${active != null && active !== i ? "opacity-40" : ""}`}
              style={{ height: b.revenueCents ? `${Math.max((b.revenueCents / max) * 100, 2)}%` : "2px" }}
            />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-[2px] border-t border-[var(--p-line)] pt-1.5 text-[11px] text-[var(--p-muted)]">
        {showTicks ? (
          bars.map((b) => (
            <span key={b.date} className="min-w-0 flex-1 truncate text-center">
              {dayLabel(b.date, bars.length <= 7 ? { weekday: "short" } : { day: "numeric" })}
            </span>
          ))
        ) : (
          <div className="flex w-full justify-between">
            <span>{dayLabel(bars[0].date, { day: "numeric", month: "short" })}</span>
            <span>{dayLabel(bars[bars.length - 1].date, { day: "numeric", month: "short" })}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Lo más vendido ──────────────────────────────────────────────────────
function Ranking({ title, rows, empty }: { title: string; rows: { name: string; quantity: number; revenueCents: number }[]; empty: string }) {
  const max = Math.max(...rows.map((r) => r.revenueCents), 1);
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--p-muted)]">{empty}</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.name}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="mr-1.5 tabular-nums text-[var(--p-muted)]">{i + 1}.</span>
                  {r.name}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{eurShort(r.revenueCents)}</span>
                  <span className="text-[var(--p-muted)]"> · {r.quantity} uds</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-black/[0.05]">
                <div className="h-full rounded-full bg-[var(--p-brand)]" style={{ width: `${Math.max((r.revenueCents / max) * 100, 1)}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── Horas punta: día de la semana × hora, un solo color de claro a oscuro ─
function Heatmap({ heatmap }: { heatmap: number[][] }) {
  const max = Math.max(...heatmap.flat(), 0);
  const used = heatmap[0].map((_, h) => heatmap.some((row) => row[h] > 0));
  const first = used.indexOf(true);
  const last = used.lastIndexOf(true);
  const hours = first === -1 ? [] : Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const [active, setActive] = useState<{ d: number; h: number } | null>(null);
  const busiest = useMemo(() => {
    let best = { d: 0, h: 0, n: 0 };
    heatmap.forEach((row, d) => row.forEach((n, h) => n > best.n && (best = { d, h, n })));
    return best;
  }, [heatmap]);
  const cell = active ? { ...active, n: heatmap[active.d][active.h] } : null;
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

  return (
    <Card title="Horas punta">
      {max === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--p-muted)]">Aún no hay pedidos en este periodo</p>
      ) : (
        <>
          <p className="mb-3 min-h-5 text-sm">
            {cell ? (
              <>
                <span className="text-[var(--p-muted)]">
                  {WEEKDAYS[cell.d]} de {hh(cell.h)} a {hh(cell.h + 1)} ·{" "}
                </span>
                <span className="font-semibold tabular-nums">
                  {cell.n} {cell.n === 1 ? "pedido" : "pedidos"}
                </span>
              </>
            ) : (
              <span className="text-[var(--p-muted)]">
                Más pedidos: <span className="font-semibold text-[var(--p-ink)]">{WEEKDAYS[busiest.d]} de {hh(busiest.h)} a {hh(busiest.h + 1)}</span> ({busiest.n})
              </span>
            )}
          </p>
          <div className="overflow-x-auto" onMouseLeave={() => setActive(null)}>
            <table className="w-full border-separate border-spacing-[2px] text-[11px] text-[var(--p-muted)]">
              <thead>
                <tr>
                  <th />
                  {hours.map((h) => (
                    <th key={h} className="min-w-6 px-0 font-normal tabular-nums">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.map((row, d) => (
                  <tr key={d}>
                    <th className="pr-1.5 text-left font-normal">{WEEKDAYS[d]}</th>
                    {hours.map((h) => {
                      const n = row[h];
                      const pct = n ? 15 + Math.round((n / max) * 85) : 0;
                      const isActive = active?.d === d && active.h === h;
                      return (
                        <td key={h} className="p-0">
                          <button
                            type="button"
                            onMouseEnter={() => setActive({ d, h })}
                            onFocus={() => setActive({ d, h })}
                            onClick={() => setActive({ d, h })}
                            aria-label={`${WEEKDAYS[d]} ${hh(h)}: ${n} pedidos`}
                            className={`block h-7 w-full min-w-6 rounded-[4px] ${n ? "" : "bg-black/[0.04]"} ${isActive ? "ring-2 ring-[var(--p-ink)]" : ""}`}
                            style={n ? { backgroundColor: `color-mix(in srgb, var(--p-brand) ${pct}%, var(--p-surface))` } : undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--p-muted)]">
            <span>Menos</span>
            {[15, 40, 65, 100].map((p) => (
              <span key={p} className="h-3 w-5 rounded-[3px]" style={{ backgroundColor: `color-mix(in srgb, var(--p-brand) ${p}%, var(--p-surface))` }} />
            ))}
            <span>Más</span>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Domicilio frente a recoger ──────────────────────────────────────────
function Channels({ report }: { report: Report }) {
  const total = report.byChannel.reduce((a, c) => a + c.orders, 0);
  const label = { DELIVERY: "A domicilio", TAKEAWAY: "Para recoger" } as const;
  return (
    <Card title="Domicilio y recogida">
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--p-muted)]">Aún no hay pedidos en este periodo</p>
      ) : (
        <ul className="space-y-4">
          {report.byChannel.map((c) => {
            const pct = (c.orders / total) * 100;
            return (
              <li key={c.channel}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{label[c.channel]}</span>
                  <span className="tabular-nums">
                    <span className="font-semibold">{Math.round(pct)}%</span>
                    <span className="text-[var(--p-muted)]">
                      {" "}
                      · {c.orders} {c.orders === 1 ? "pedido" : "pedidos"} · {eurShort(c.revenueCents)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-black/[0.05]">
                  <div className="h-full rounded-full bg-[var(--p-brand)]" style={{ width: `${Math.max(pct, 1)}%` }} />
                </div>
              </li>
            );
          })}
          {report.totals.deliveryFeesCents > 0 && (
            <li className="text-xs text-[var(--p-muted)]">Gastos de envío cobrados: {eur(report.totals.deliveryFeesCents)}</li>
          )}
          {report.totals.taxCents > 0 && (
            <li className="text-xs text-[var(--p-muted)]">
              IVA incluido en las ventas ({report.totals.taxRate} %): {eur(report.totals.taxCents)}
            </li>
          )}
          {report.totals.tipsCents > 0 && <li className="text-xs text-[var(--p-muted)]">Propinas: {eur(report.totals.tipsCents)}</li>}
        </ul>
      )}
    </Card>
  );
}

// ── Cupones ─────────────────────────────────────────────────────────────
function Coupons({ report }: { report: Report }) {
  return (
    <Card
      title="Cupones y promociones"
      aside={
        report.totals.orders > 0 && (
          <span className="text-xs text-[var(--p-muted)] tabular-nums">{Math.round(((report.ordersWithDiscount ?? 0) / report.totals.orders) * 100)}% de los pedidos con descuento</span>
        )
      }
    >
      {report.coupons.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--p-muted)]">No se ha usado ningún cupón ni promoción en este periodo</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[280px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--p-muted)]">
                <th className="pb-2 font-normal">Descuento</th>
                <th className="pb-2 text-right font-normal">Usos</th>
                <th className="pb-2 text-right font-normal">Descontado</th>
              </tr>
            </thead>
            <tbody>
              {report.coupons.map((c) => (
                <tr key={c.code} className="border-t border-[var(--p-line)]">
                  <td className={`py-2 ${/^[A-Z0-9_-]+$/.test(c.code) ? "font-mono text-[13px]" : ""}`}>{c.code}</td>
                  <td className="py-2 text-right tabular-nums">{c.uses}</td>
                  <td className="py-2 text-right tabular-nums">{eur(c.discountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
