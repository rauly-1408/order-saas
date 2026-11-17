"use client";

import { useMemo, useState } from "react";
import { margin } from "@/app/lib/costs";
import { withPrepMarkup } from "@/app/lib/pricing";
import { dishAllergens, priceRiseReport, type PriceRise } from "@/app/lib/costReports";
import AllergenIcon from "./AllergenIcon";
import { ALLERGENS, euros, linesCost, typicalPlate, type BaseUnit, type Overview } from "./types";

type Props = { data: Overview; onGoToRecipes: () => void };

const CARD = "rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

export default function Informes({ data, onGoToRecipes }: Props) {
  return (
    <div className="space-y-6">
      <InformePrecios data={data} />
      <InformeAlergenos data={data} onGoToRecipes={onGoToRecipes} />
    </div>
  );
}

// ── Subidas de precio ────────────────────────────────────────────────────────

const PERIODS = [
  { days: 30, label: "30 días" },
  { days: 90, label: "3 meses" },
  { days: 365, label: "1 año" },
] as const;

// Precio por kilo, litro o unidad a partir del coste por unidad base.
function unitPrice(cents: number, unit: BaseUnit): string {
  if (unit === "G") return `${euros(cents * 1000)}/kg`;
  if (unit === "ML") return `${euros(cents * 1000)}/l`;
  return `${euros(cents)}/${unit === "UNIT" ? "ud" : unit === "KG" ? "kg" : "l"}`;
}

const signed = (cents: number) => `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${euros(Math.abs(cents))}`;

function InformePrecios({ data }: { data: Overview }) {
  const [days, setDays] = useState<number>(90);
  const [open, setOpen] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const products = useMemo(() => data.categories.flatMap((c) => c.products), [data.categories]);
  const ingredients = useMemo(() => new Map(withPrepMarkup(data.ingredients, data.costSettings.prepMarkupPct).map((i) => [i.id, i])), [data]);

  const rises = useMemo(
    () => priceRiseReport(data.priceChanges, data.ingredients, products, data.sales.last30, new Date(now - days * 86_400_000)),
    [data.priceChanges, data.ingredients, data.sales.last30, products, days, now]
  );
  const up = rises.filter((r) => r.pct > 0);
  const down = rises.filter((r) => r.pct < 0);
  const monthlyUp = up.reduce((a, r) => a + Math.max(r.monthlyCents, 0), 0);
  const monthlyDown = down.reduce((a, r) => a + Math.min(r.monthlyCents, 0), 0);
  const hasSales = Object.keys(data.sales.last30).length > 0;

  return (
    <section className={CARD} aria-labelledby="inf-precios">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 id="inf-precios" className="text-[17px] font-semibold">Subidas de precio</h2>
          <p className="mt-0.5 text-xs text-[var(--p-muted)]">Qué ingredientes te han subido los proveedores y cuánto encarecen cada plato.</p>
        </div>
        <div className="flex gap-1 rounded-full bg-black/[0.05] p-1" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              aria-pressed={days === p.days}
              onClick={() => setDays(p.days)}
              className={`p-press min-h-9 rounded-full px-3 text-xs font-medium ${days === p.days ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 px-4 pt-4 sm:grid-cols-3">
        <Stat label="Han subido" value={String(up.length)} sub={up.length ? up.slice(0, 3).map((r) => r.name).join(", ") : "Ningún ingrediente"} tone={up.length ? "warn" : "ok"} />
        <Stat
          label="Te cuesta más al mes"
          value={hasSales ? euros(monthlyUp) : "—"}
          sub={hasSales ? "Con lo que has vendido en 30 días" : "Aún no hay ventas para calcularlo"}
          tone={monthlyUp > 0 ? "warn" : "ok"}
        />
        <Stat label="Han bajado" value={String(down.length)} sub={down.length && hasSales ? `Ahorras ${euros(-monthlyDown)} al mes` : down.length ? down.slice(0, 3).map((r) => r.name).join(", ") : "Ningún ingrediente"} />
      </div>

      {rises.length === 0 ? (
        <p className="px-5 py-5 text-sm text-[var(--p-muted)]">
          Sin cambios de precio en este periodo. Se apuntan solos al editar el precio de un ingrediente o al recibir un pedido o un albarán con otro precio.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--p-line)] border-t border-[var(--p-line)]">
          {rises.map((r) => (
            <RiseRow key={r.ingredientId} r={r} unit={data.ingredients.find((i) => i.id === r.ingredientId)?.baseUnit ?? "UNIT"} open={open === r.ingredientId} onToggle={() => setOpen(open === r.ingredientId ? null : r.ingredientId)} costOf={(id) => {
              const p = products.find((x) => x.id === id);
              if (!p) return null;
              const t = typicalPlate(p);
              const cost = linesCost(t.lines, ingredients);
              return { cost, foodCost: margin(cost, t.priceCents).foodCostPct };
            }} hasSales={hasSales} />
          ))}
        </ul>
      )}
      <div className="h-2" />
    </section>
  );
}

function RiseRow({
  r,
  unit,
  open,
  onToggle,
  costOf,
  hasSales,
}: {
  r: PriceRise;
  unit: BaseUnit;
  open: boolean;
  onToggle: () => void;
  costOf: (productId: string) => { cost: number; foodCost: number | null } | null;
  hasSales: boolean;
}) {
  const isUp = r.pct > 0;
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="p-press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02]">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{r.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isUp ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"}`}>
              {isUp ? "+" : ""}
              {r.pct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
            </span>
          </span>
          <span className="block text-xs text-[var(--p-muted)]">
            {unitPrice(r.oldUnitCents, unit)} → <span className="font-semibold text-[var(--p-ink)]">{unitPrice(r.newUnitCents, unit)}</span> · desde el{" "}
            {new Date(r.since).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
          </span>
          <span className="block text-xs text-[var(--p-muted)]">
            {r.dishes.length === 0 ? "No está en ningún escandallo" : `Afecta a ${r.dishes.length} plato${r.dishes.length === 1 ? "" : "s"}`}
            {hasSales && r.dishes.length > 0 && Math.abs(r.monthlyCents) >= 1 && (
              <>
                {" · "}
                <span className={`font-semibold ${isUp ? "text-red-600" : "text-emerald-700"}`}>{signed(r.monthlyCents)} al mes</span>
              </>
            )}
          </span>
        </span>
        {r.dishes.length > 0 && (
          <span aria-hidden className={`text-[var(--p-faint)] transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
            ›
          </span>
        )}
      </button>
      {open && r.dishes.length > 0 && (
        <div className="px-4 pb-3">
          <div className="overflow-x-auto rounded-xl bg-[var(--p-bg)]">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[11px] text-[var(--p-muted)]">
                  <th className="px-3 py-2 font-medium">Plato</th>
                  <th className="px-3 py-2 text-right font-medium">Por plato</th>
                  <th className="px-3 py-2 text-right font-medium">Coste ahora</th>
                  <th className="px-3 py-2 text-right font-medium">Al mes</th>
                </tr>
              </thead>
              <tbody>
                {r.dishes.map((d) => {
                  const c = costOf(d.productId);
                  return (
                    <tr key={d.productId} className="border-t border-[var(--p-line)]">
                      <td className="px-3 py-2">{d.name}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${d.deltaCents > 0 ? "text-red-600" : "text-emerald-700"}`}>{signed(d.deltaCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c ? euros(c.cost) : "—"}
                        {c?.foodCost != null && <span className="block text-[11px] text-[var(--p-muted)]">food cost {c.foodCost.toLocaleString("es-ES", { maximumFractionDigits: 0 })} %</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {d.soldLast30 > 0 ? signed(d.monthlyCents) : "—"}
                        <span className="block text-[11px] text-[var(--p-muted)]">{d.soldLast30} vendidos</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-[var(--p-muted)]">«Al mes» usa lo que vendiste de cada plato en los últimos 30 días. El coste cuenta el plato como sale de cocina (con su pan y guarnición por defecto).</p>
        </div>
      )}
    </li>
  );
}

// ── Alérgenos por plato ──────────────────────────────────────────────────────

function InformeAlergenos({ data, onGoToRecipes }: { data: Overview; onGoToRecipes: () => void }) {
  const [filter, setFilter] = useState<string | null>(null);
  const byIngredient = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i.allergens])), [data.ingredients]);
  const rows = useMemo(
    () => data.categories.map((c) => ({ id: c.id, name: c.name, dishes: c.products.map((p) => ({ p, a: dishAllergens(p, byIngredient) })) })).filter((c) => c.dishes.length > 0),
    [data.categories, byIngredient]
  );
  const all = rows.flatMap((c) => c.dishes);
  const missing = all.filter((d) => !d.a.hasData);
  const has = (d: (typeof all)[number], a: string) => d.a.allergens.includes(a) || d.a.byOption.some((o) => o.extra.includes(a));
  const free = filter ? all.filter((d) => d.a.hasData && !has(d, filter)).length : 0;

  return (
    <section className={CARD} aria-labelledby="inf-alergenos">
      <div className="px-5 pt-4">
        <h2 id="inf-alergenos" className="text-[17px] font-semibold">Alérgenos por plato</h2>
        <p className="mt-0.5 text-xs text-[var(--p-muted)]">
          Los 14 alérgenos obligatorios de cada plato, sacados de sus ingredientes y de lo declarado en Carta. Es lo mismo que ve el cliente en la tienda.
        </p>
      </div>

      {missing.length > 0 && (
        <button type="button" onClick={onGoToRecipes} className="p-press mx-4 mt-3 block w-[calc(100%-2rem)] rounded-xl bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-800">
          <span className="font-semibold">
            {missing.length} plato{missing.length === 1 ? "" : "s"} sin datos de alérgenos
          </span>{" "}
          ({missing.slice(0, 4).map((d) => d.p.name).join(", ")}
          {missing.length > 4 ? "…" : ""}). Hazles el escandallo o declara sus alérgenos en Carta. <span className="font-semibold">Ir a escandallos ›</span>
        </button>
      )}

      <div className="px-4 pt-3">
        <p className="mb-1.5 text-[11px] font-medium text-[var(--p-muted)]">¿Qué platos puede tomar alguien con alergia a…?</p>
        <div className="flex flex-wrap gap-1.5">
          {ALLERGENS.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={filter === a}
              onClick={() => setFilter(filter === a ? null : a)}
              className={`p-press inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 text-xs ${filter === a ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)] font-semibold text-[var(--p-brand)]" : "border-[var(--p-line)] text-[var(--p-ink)]"}`}
            >
              <AllergenIcon name={a} size={18} />
              {a}
            </button>
          ))}
        </div>
        {filter && (
          <p className="mt-2 text-xs text-[var(--p-muted)]">
            <span className="font-semibold text-[var(--p-ink)]">{free}</span> plato{free === 1 ? "" : "s"} sin {filter.toLowerCase()} (en verde). Los que solo lo llevan en alguna opción se marcan aparte.
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-[var(--p-line)]">
        {rows.map((c) => (
          <div key={c.id}>
            <h3 className="bg-[var(--p-bg)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--p-muted)]">{c.name}</h3>
            <ul className="divide-y divide-[var(--p-line)]">
              {c.dishes.map(({ p, a }) => {
                const inBase = filter ? a.allergens.includes(filter) : false;
                const inOption = filter ? !inBase && a.byOption.some((o) => o.extra.includes(filter)) : false;
                const ok = filter && a.hasData && !inBase && !inOption;
                return (
                  <li key={p.id} className={`px-4 py-2.5 ${filter && (inBase || !a.hasData) ? "opacity-45" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2 font-medium">
                        {ok && <span aria-label="Apto" className="text-emerald-600">✓</span>}
                        <span className="min-w-0">{p.name}</span>
                      </span>
                      {!a.hasData ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">Sin datos</span>
                      ) : a.allergens.length === 0 ? (
                        <span className="text-xs text-[var(--p-muted)]">Sin alérgenos</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1" aria-label={`Alérgenos: ${a.allergens.join(", ")}`}>
                          {a.allergens.map((x) => (
                            <span key={x} title={x} className={filter === x ? "rounded-full ring-2 ring-red-400" : ""}>
                              <AllergenIcon name={x} size={22} />
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {a.hasData && a.allergens.length > 0 && <p className="mt-0.5 text-xs text-[var(--p-muted)]">{a.allergens.join(", ")}</p>}
                    {a.byOption.length > 0 && (
                      <p className={`mt-0.5 text-xs ${inOption ? "font-semibold text-amber-700" : "text-[var(--p-muted)]"}`}>
                        Según la opción: {a.byOption.map((o) => `${o.option} (${o.extra.join(", ").toLowerCase()})`).join(" · ")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="h-2" />
    </section>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-2xl bg-[var(--p-bg)] p-4">
      <div className="text-sm text-[var(--p-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-amber-700" : ""}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-[var(--p-muted)]">{sub}</div>
    </div>
  );
}
