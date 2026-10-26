"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { euros, formatQty, type Overview } from "./types";

// Informe de stock por fechas: lo que se compró, lo que salió con las ventas, lo
// que debería quedar y lo que se contó → pérdidas en cantidad y en euros. Debajo,
// el género parado. Ver docs/MODULO-COSTES.md
type Row = {
  ingredientId: string;
  start: number;
  bought: number;
  produced: number;
  sold: number;
  usedInBatches: number;
  wasted: number;
  expected: number;
  countDiff: number;
  end: number;
  lossQty: number;
  lossCents: number;
  boughtCents: number;
  soldCents: number;
};
type Report = { from: string; to: string; rows: Row[]; idle: { id: string; idleDays: number }[] };

const ymd = (d: Date) => d.toLocaleDateString("sv-SE");
const plus = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
function presets(): { key: string; label: string; from: string; to: string }[] {
  const now = new Date();
  const monday = plus(now, -((now.getDay() + 6) % 7));
  return [
    { key: "7", label: "Últimos 7 días", from: ymd(plus(now, -6)), to: ymd(now) },
    { key: "week", label: "Semana pasada", from: ymd(plus(monday, -7)), to: ymd(plus(monday, -1)) },
    { key: "month", label: "Este mes", from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) },
  ];
}
const fmtDay = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

export default function InformeStock({ data, api }: { data: Overview; api: string }) {
  const options = useMemo(presets, []);
  const [range, setRange] = useState({ from: options[0].from, to: options[0].to });
  const [idleDays, setIdleDays] = useState(7);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const byId = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${api}/stock/report?from=${range.from}&to=${range.to}&idleDays=${idleDays}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar el informe");
      setReport(json as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el informe");
    } finally {
      setLoading(false);
    }
  }, [api, range, idleDays]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = (report?.rows ?? []).filter((r) => byId.has(r.ingredientId)).sort((a, b) => b.lossCents - a.lossCents || (byId.get(a.ingredientId)!.name.localeCompare(byId.get(b.ingredientId)!.name, "es")));
  const totals = rows.reduce((t, r) => ({ bought: t.bought + r.boughtCents, sold: t.sold + r.soldCents, loss: t.loss + r.lossCents }), { bought: 0, sold: 0, loss: 0 });
  const preset = options.find((o) => o.from === range.from && o.to === range.to)?.key ?? "custom";

  function downloadCsv() {
    const head = ["Ingrediente", "Unidad", "Al empezar", "Comprado", "De lotes", "Vendido", "En lotes", "Mermas", "Debería quedar", "Descuadre recuentos", "Queda", "Pérdida", "Pérdida €"];
    const lines = rows.map((r) => {
      const i = byId.get(r.ingredientId)!;
      const n = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
      return [i.name, i.baseUnit.toLowerCase(), n(r.start), n(r.bought), n(r.produced), n(r.sold), n(r.usedInBatches), n(r.wasted), n(r.expected), n(r.countDiff), n(r.end), n(r.lossQty), n(r.lossCents / 100)];
    });
    const csv = [head, ...lines].map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `stock-${range.from}-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-4">
          <div>
            <h2 className="text-[17px] font-semibold">Informe de stock</h2>
            <p className="text-xs text-[var(--p-muted)]">Comprado, vendido, lo que debería quedar y lo que se contó. Las pérdidas son las mermas más lo que faltó en los recuentos.</p>
          </div>
          {rows.length > 0 && (
            <button onClick={downloadCsv} className="rounded-lg border border-[var(--p-line)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--p-bg)]">
              Descargar (Excel)
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
          {options.map((o) => (
            <button key={o.key} onClick={() => setRange({ from: o.from, to: o.to })} className={`rounded-full px-3 py-1 text-xs font-semibold ${preset === o.key ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-bg)] text-[var(--p-muted)] hover:text-[var(--p-ink)]"}`}>
              {o.label}
            </button>
          ))}
          <span className="flex items-center gap-1 text-xs text-[var(--p-muted)]">
            <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} aria-label="Desde" className="rounded-lg border border-[var(--p-line)] bg-white px-2 py-1 text-xs text-[var(--p-ink)]" />
            a
            <input type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} aria-label="Hasta" className="rounded-lg border border-[var(--p-line)] bg-white px-2 py-1 text-xs text-[var(--p-ink)]" />
          </span>
        </div>

        {error ? (
          <p className="px-4 py-5 text-sm text-red-600">{error}</p>
        ) : loading && !report ? (
          <p className="px-4 py-5 text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--p-muted)]">Sin movimientos de stock entre el {fmtDay(range.from)} y el {fmtDay(range.to)}.</p>
        ) : (
          <>
            <div className={`grid gap-3 px-4 pt-4 sm:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
              <Mini label="Comprado" value={euros(totals.bought)} />
              <Mini label="Salido con las ventas (a coste)" value={euros(totals.sold)} />
              <Mini label="Pérdidas" value={euros(totals.loss)} warn={totals.loss > 0} />
            </div>
            <div className={`mt-3 overflow-x-auto ${loading ? "opacity-60" : ""}`}>
              <table className="w-full min-w-[760px] whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-y border-[var(--p-line)] text-left text-[11px] uppercase tracking-wide text-[var(--p-muted)]">
                    <th className="px-4 py-2 font-semibold">Ingrediente</th>
                    <th className="px-2 py-2 text-right font-semibold">Al empezar</th>
                    <th className="px-2 py-2 text-right font-semibold">Entra</th>
                    <th className="px-2 py-2 text-right font-semibold">Vendido</th>
                    <th className="px-2 py-2 text-right font-semibold">Mermas</th>
                    <th className="px-2 py-2 text-right font-semibold">Debería quedar</th>
                    <th className="px-2 py-2 text-right font-semibold">Recuento</th>
                    <th className="px-2 py-2 text-right font-semibold">Queda</th>
                    <th className="px-4 py-2 text-right font-semibold">Pérdida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--p-line)]">
                  {rows.map((r) => {
                    const i = byId.get(r.ingredientId)!;
                    const q = (v: number) => (Math.abs(v) < 1e-9 ? "—" : formatQty(v, i.baseUnit));
                    return (
                      <tr key={r.ingredientId}>
                        <td className="px-4 py-2 font-medium">{i.name}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{q(r.start)}</td>
                        <td className="px-2 py-2 text-right tabular-nums" title={r.produced ? `Comprado ${formatQty(r.bought, i.baseUnit)} · de lotes ${formatQty(r.produced, i.baseUnit)}` : undefined}>
                          {q(r.bought + r.produced)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums" title={r.usedInBatches ? `En lotes ${formatQty(r.usedInBatches, i.baseUnit)}` : undefined}>
                          {q(r.sold + r.usedInBatches)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{q(r.wasted)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatQty(r.expected, i.baseUnit)}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${r.countDiff < 0 ? "text-red-600" : ""}`}>
                          {Math.abs(r.countDiff) < 1e-9 ? "—" : `${r.countDiff > 0 ? "+" : ""}${formatQty(r.countDiff, i.baseUnit)}`}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">{formatQty(r.end, i.baseUnit)}</td>
                        <td className={`px-4 py-2 text-right tabular-nums ${r.lossCents > 0 ? "font-semibold text-red-600" : "text-[var(--p-muted)]"}`}>
                          {r.lossQty > 0 ? (
                            <>
                              {formatQty(r.lossQty, i.baseUnit)}
                              <span className="block text-[11px]">{euros(r.lossCents)}</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 pt-2 pb-4 text-[11px] text-[var(--p-muted)]">«Entra» incluye lo comprado y lo hecho en lotes; «Vendido», lo salido con los pedidos y lo usado en lotes. Para que el informe cuadre, haz un recuento al final de cada semana.</p>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 className="text-[17px] font-semibold">Género parado</h2>
          <label className="flex items-center gap-1.5 text-xs text-[var(--p-muted)]">
            Sin salir en
            <select value={idleDays} onChange={(e) => setIdleDays(Number(e.target.value))} className="rounded-lg border border-[var(--p-line)] bg-white px-2 py-1 text-xs text-[var(--p-ink)]">
              {[3, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d} días
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="px-5 pt-1 text-xs text-[var(--p-muted)]">Lo que tienes en cámara y no se ha gastado. Úsalo antes de que caduque o deja de pedirlo.</p>
        {!report ? null : report.idle.filter((x) => byId.has(x.id)).length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--p-muted)]">Nada parado más de {idleDays} días.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--p-line)]">
            {report.idle
              .filter((x) => byId.has(x.id))
              .map((x) => {
                const i = byId.get(x.id)!;
                return (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <span className="font-semibold">{i.name}</span>
                      <div className="text-xs text-[var(--p-muted)]">
                        Hay {formatQty(i.stockQty, i.baseUnit)} · {euros(Math.max(i.stockQty, 0) * unitCostCents(i))}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${x.idleDays >= 14 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>{x.idleDays} días sin salir</span>
                  </li>
                );
              })}
          </ul>
        )}
        <div className="h-3" />
      </section>
    </>
  );
}

function Mini({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--p-bg)] px-3 py-2">
      <div className="text-xs text-[var(--p-muted)]">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${warn ? "text-red-600" : ""}`}>{value}</div>
    </div>
  );
}
