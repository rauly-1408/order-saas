"use client";

import { useState } from "react";
import { breakEven, fixedMonthlyCents, type CostSettings } from "@/app/lib/pricing";
import { euros, type Overview } from "./types";

// Gastos fijos del local y punto de equilibrio: cuánto hay que ganar al día y
// cuántos productos hay que vender para pagarlos, con el margen real de los
// últimos 30 días. Se guarda con la barra «Cambios sin guardar» de Rentabilidad.
const HINTS = ["Alquiler", "Sueldos y Seguridad Social", "Luz y agua", "Gas", "Gestoría", "Seguros", "Internet y teléfono", "Programas (TPV, web…)", "Préstamos y leasing"];

const toEuros = (cents: number) => (cents ? String(cents / 100).replace(".", ",") : "");
const toCents = (v: string) => Math.max(0, Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100) || 0);

type Props = { form: CostSettings; set: (p: Partial<CostSettings>) => void; period: Overview["period"] };

export default function GastosFijos({ form, set, period }: Props) {
  // Texto de cada importe mientras se escribe (para no pelear con las comas).
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const total = fixedMonthlyCents(form);
  const { last30, month } = period;
  const marginPerItem = last30.items > 0 ? last30.marginCents / last30.items : null;
  const be = breakEven(total, form.openDaysPerMonth, marginPerItem);
  const covered = total > 0 ? Math.max(0, month.marginCents) / total : 0;
  const unused = HINTS.filter((h) => !form.fixedCosts.some((f) => f.label === h));

  const setRow = (i: number, patch: Partial<{ label: string; cents: number }>) => set({ fixedCosts: form.fixedCosts.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const remove = (i: number) => {
    set({ fixedCosts: form.fixedCosts.filter((_, j) => j !== i) });
    setDrafts({});
  };
  const add = (label: string) => set({ fixedCosts: [...form.fixedCosts, { label, cents: 0 }] });

  return (
    <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <h2 className="text-[17px] font-semibold">Gastos fijos y punto de equilibrio</h2>
      <p className="mt-0.5 text-xs text-[var(--p-muted)]">Lo que pagas cada mes vendas o no. Con el margen de tus ventas te decimos cuánto tienes que vender al día para cubrirlo.</p>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <ul className="space-y-2">
            {form.fixedCosts.map((f, i) => (
              <li key={i} className="flex items-center gap-2">
                <input value={f.label} onChange={(e) => setRow(i, { label: e.target.value })} aria-label="Concepto" className="min-w-0 flex-1 rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm" />
                <span className="flex items-center gap-1">
                  <input
                    inputMode="decimal"
                    value={drafts[i] ?? toEuros(f.cents)}
                    onChange={(e) => {
                      setDrafts((d) => ({ ...d, [i]: e.target.value }));
                      setRow(i, { cents: toCents(e.target.value) });
                    }}
                    placeholder="0"
                    aria-label={`Importe de ${f.label} al mes`}
                    className="w-24 rounded-lg border border-[var(--p-line)] px-3 py-2 text-right text-sm"
                  />
                  <span className="text-sm text-[var(--p-muted)]">€</span>
                </span>
                <button type="button" onClick={() => remove(i)} aria-label={`Quitar ${f.label}`} className="rounded-lg px-2 py-1 text-[var(--p-faint)] hover:text-red-500">
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {unused.map((h) => (
              <button key={h} type="button" onClick={() => add(h)} className="rounded-full border border-[var(--p-line)] px-2.5 py-1 text-xs text-[var(--p-muted)] hover:bg-[var(--p-bg)] hover:text-[var(--p-ink)]">
                + {h}
              </button>
            ))}
            <button type="button" onClick={() => add("")} className="rounded-full border border-dashed border-[var(--p-line)] px-2.5 py-1 text-xs text-[var(--p-muted)] hover:text-[var(--p-ink)]">
              + Otro
            </button>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            Abres
            <input
              type="number"
              min={1}
              max={31}
              value={form.openDaysPerMonth}
              onChange={(e) => set({ openDaysPerMonth: Math.min(31, Math.max(1, Math.round(Number(e.target.value)) || 1)) })}
              className="w-16 rounded-lg border border-[var(--p-line)] px-2 py-1 text-sm"
            />
            días al mes
          </label>
        </div>

        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Box label="Gastos fijos al mes" value={euros(total)} />
            <Box label="Al día que abres" value={euros(be.perDayCents)} />
          </div>
          {total === 0 ? (
            <p className="rounded-xl bg-[var(--p-bg)] px-4 py-3 text-sm text-[var(--p-muted)]">Añade tus gastos fijos para ver tu punto de equilibrio.</p>
          ) : marginPerItem == null || marginPerItem <= 0 ? (
            <p className="rounded-xl bg-[var(--p-bg)] px-4 py-3 text-sm text-[var(--p-muted)]">Aún no hay ventas con margen en los últimos 30 días para calcular cuánto tienes que vender.</p>
          ) : (
            <div className="rounded-xl bg-[var(--p-bg)] px-4 py-3">
              <p className="text-sm text-[var(--p-muted)]">Para cubrir los gastos fijos tienes que vender unos</p>
              <p className="text-2xl font-bold tabular-nums sm:text-3xl">{be.itemsPerDay} productos al día</p>
              <p className="mt-1 text-xs text-[var(--p-muted)]">
                Con lo que te deja de media cada producto vendido en los últimos 30 días: {euros(marginPerItem)} (ya sin IVA, ingredientes, packaging ni comisiones){!last30.complete && ". Hay productos sin escandallo, así que el margen real es algo menor"}.
              </p>
            </div>
          )}
          {total > 0 && (
            <div className="rounded-xl border border-[var(--p-line)] px-4 py-3">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-semibold">Este mes</span>
                <span className="text-[var(--p-muted)]">
                  día {month.daysElapsed} de {month.daysInMonth}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/[0.06]">
                <div className="h-full rounded-full bg-[var(--p-brand)]" style={{ width: `${Math.min(100, covered * 100)}%` }} />
              </div>
              <p className="mt-2 text-sm">
                Llevas <span className="font-semibold">{euros(month.marginCents)}</span> de margen: cubres el <span className="font-semibold">{Math.round(covered * 100)} %</span> de los gastos fijos.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--p-bg)] px-3 py-2">
      <div className="text-xs text-[var(--p-muted)]">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
