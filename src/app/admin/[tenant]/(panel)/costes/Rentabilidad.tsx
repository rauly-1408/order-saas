"use client";

import { ask } from "@/app/lib/dialog";
import { useMemo, useState } from "react";
import { foodCostHealth, margin, suggestedGrossPriceCents, type Health } from "@/app/lib/costs";
import { markupPriceCents, withPrepMarkup, type CostSettings } from "@/app/lib/pricing";
import { toast, useSaveBar } from "../configuracion/ui";
import GastosFijos from "./GastosFijos";
import { euros, linesCost, typicalPlate, type Ingredient, type Overview } from "./types";

const HEALTH_CLS: Record<Health, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-600",
  unknown: "bg-[var(--p-bg)] text-[var(--p-muted)]",
};

type Props = { data: Overview; api: string; onSaved: () => Promise<void>; onGoToRecipes: () => void };

export default function Rentabilidad({ data, api, onSaved, onGoToRecipes }: Props) {
  // Cómo pone sus precios el restaurante y sus gastos fijos: se prueban en vivo
  // y se guardan con la barra «Cambios sin guardar».
  const [form, setForm] = useState<CostSettings>(data.costSettings);
  const saved = JSON.stringify(data.costSettings);
  const dirty = JSON.stringify(form) !== saved;
  useSaveBar("costes-precios", {
    dirty,
    discard: () => setForm(JSON.parse(saved) as CostSettings),
    save: async () => {
      const res = await fetch(`${api}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        toast("No se pudo guardar", false);
        return false;
      }
      const json = (await res.json()) as { costs: CostSettings };
      setForm(json.costs);
      await onSaved();
      return true;
    },
  });
  const set = (patch: Partial<CostSettings>) => setForm((f) => ({ ...f, ...patch }));
  const markup = form.priceMode === "MARKUP";
  const target = form.targetFoodCostPct;
  const hasPreps = data.ingredients.some((i) => i.isPrep);
  const [applying, setApplying] = useState<string | null>(null);

  // Aplica el precio sugerido en la carta. El sugerido es del plato típico
  // (con opciones por defecto), así que al precio base se le restan sus suplementos.
  async function applyPrice(r: { id: string; name: string; priceCents: number; suggested: number; defaultsDelta: number; basePriceCents: number }) {
    const newBase = r.suggested - r.defaultsDelta;
    if (!(await ask(`¿Cambiar el precio de ${r.name} en la carta de ${euros(r.basePriceCents)} a ${euros(newBase)}?`))) return;
    setApplying(r.id);
    const productsApi = api.replace(/\/costs$/, "/products");
    await fetch(`${productsApi}/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basePriceCents: newBase }) });
    await onSaved();
    setApplying(null);
  }
  // Las elaboraciones cuestan al local lo del obrador más su recargo.
  const ingredients = useMemo(() => new Map<string, Ingredient>(withPrepMarkup(data.ingredients, form.prepMarkupPct).map((i) => [i.id, i])), [data.ingredients, form.prepMarkupPct]);

  const rows = useMemo(() => {
    return data.categories
      .flatMap((c) => c.products.map((p) => ({ p, category: c.name })))
      .map(({ p, category }) => {
        const plate = typicalPlate(p);
        const cost = linesCost(plate.lines, ingredients);
        const m = margin(cost, plate.priceCents);
        return {
          id: p.id,
          name: p.name,
          category,
          basePriceCents: p.basePriceCents,
          defaultsDelta: plate.priceCents - p.basePriceCents,
          priceCents: plate.priceCents,
          costCents: cost,
          m,
          missing: plate.missing,
          // Con recargo no se juzga el precio: se enseña el de la fórmula al lado del de carta.
          health: plate.missing === "receta" || markup ? ("unknown" as Health) : foodCostHealth(m.foodCostPct, target),
          suggested: markup ? markupPriceCents(cost, form.markupPct) : suggestedGrossPriceCents(cost, target),
        };
      })
      .sort((a, b) => (b.m.foodCostPct ?? -1) - (a.m.foodCostPct ?? -1));
  }, [data.categories, ingredients, target, markup, form.markupPct]);

  const withRecipe = rows.filter((r) => r.missing !== "receta");
  const avgFoodCost = withRecipe.length ? withRecipe.reduce((a, r) => a + (r.m.foodCostPct ?? 0), 0) / withRecipe.length : null;
  const ordersComplete = data.orders.filter((o) => o.complete);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Platos escandallados" value={`${withRecipe.length} / ${rows.length}`} />
        <Stat label="Food cost medio" value={avgFoodCost == null ? "—" : `${avgFoodCost.toFixed(1)} %`} />
      </div>

      <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
        <h2 className="text-[17px] font-semibold">Cómo pones tus precios</h2>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-black/[0.05] p-1 sm:w-fit">
          {(
            [
              ["MARKUP", "Recargo sobre el coste"],
              ["FOOD_COST", "Food cost objetivo"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ priceMode: k })} className={`p-press rounded-full px-2 py-1.5 text-[13px] font-medium sm:px-3 sm:text-sm ${form.priceMode === k ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {markup ? (
            <PctField label="Recargo del local" value={form.markupPct} max={1000} onChange={(v) => set({ markupPct: v })} hint={`Precio de carta (con IVA) = coste × ${(1 + form.markupPct / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })}`} />
          ) : (
            <PctField label="Food cost objetivo" value={form.targetFoodCostPct} min={5} max={80} onChange={(v) => set({ targetFoodCostPct: v })} hint="El coste es este % del precio sin IVA" />
          )}
          {hasPreps && (
            <PctField label="Recargo del obrador en las elaboraciones" value={form.prepMarkupPct} max={300} onChange={(v) => set({ prepMarkupPct: v })} hint={form.prepMarkupPct > 0 ? `Las elaboraciones le cuestan al local su coste + ${form.prepMarkupPct} %` : "0 si las haces en el propio local"} />
          )}
        </div>
      </section>

      {withRecipe.length === 0 && (
        <div className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center">
          <p className="font-semibold">Aún no hay platos escandallados</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">Crea tus ingredientes y añade sus cantidades a cada plato para ver tu margen.</p>
          <button onClick={onGoToRecipes} className="mt-4 p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
            Ir a escandallos
          </button>
        </div>
      )}

      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Margen por plato</h2>
        <p className="px-4 pt-3 text-xs text-[var(--p-muted)]">
          Plato tal como sale de cocina (con el pan y la guarnición por defecto). Margen y food cost sin IVA (10 %); precios de carta con IVA.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--p-muted)]">
                {["Plato", "Precio", "Coste", "Margen", "Food cost", markup ? "Con tu recargo" : "Precio sugerido"].map((h) => (
                  <th key={h} className="px-4 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--p-line)]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-[var(--p-muted)]">{r.category}</div>
                  </td>
                  <td className="px-4 py-2.5">{euros(r.priceCents)}</td>
                  <td className="px-4 py-2.5">{r.missing === "receta" ? "—" : euros(r.costCents)}</td>
                  <td className="px-4 py-2.5">
                    {r.missing === "receta" ? "—" : `${euros(r.m.marginCents)} · ${r.m.marginPct?.toFixed(0)} %`}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${HEALTH_CLS[r.health]}`}>
                      {r.missing === "receta" ? "Sin escandallo" : `${r.m.foodCostPct?.toFixed(1)} %`}
                    </span>
                    {r.missing === "opciones" && <div className="mt-1 text-[11px] text-amber-700">Faltan opciones por escandallar</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.missing === "receta" || (!markup && r.health === "good") ? (
                      "—"
                    ) : markup && Math.abs(r.suggested - r.priceCents) < 5 ? (
                      <span className="text-[var(--p-muted)]">{euros(r.suggested)} · igual que la carta</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className={markup ? "font-semibold" : "font-semibold text-[var(--p-brand-strong)]"}>{euros(r.suggested)}</span>
                        {markup && (
                          <span className="text-[11px] text-[var(--p-muted)]">
                            carta {r.priceCents > r.suggested ? "+" : "−"}
                            {euros(Math.abs(r.priceCents - r.suggested))}
                          </span>
                        )}
                        <button
                          onClick={() => applyPrice(r)}
                          disabled={applying === r.id}
                          className="p-press rounded-full border border-[var(--p-brand)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-brand)] hover:bg-[var(--p-brand)] hover:text-white disabled:opacity-50"
                        >
                          {applying === r.id ? "…" : "Aplicar"}
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Margen real de los últimos pedidos</h2>
        <p className="px-4 pt-3 text-xs text-[var(--p-muted)]">
          Con las opciones que eligió cada cliente. Ingresos sin IVA, sin gastos de envío; se descuenta la comisión de la plataforma.
        </p>
        {data.orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--p-muted)]">Todavía no hay pedidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--p-muted)]">
                  {["Pedido", "Ingresos", "Ingredientes", "Comisión", "Margen"].map((h) => (
                    <th key={h} className="px-4 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--p-line)]">
                {data.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold">#{o.orderNumber}</span> <span className="text-[var(--p-muted)]">{o.customerName}</span>
                      {!o.complete && <div className="text-[11px] text-amber-700">Algún producto sin escandallo: coste incompleto</div>}
                    </td>
                    <td className="px-4 py-2.5">{euros(o.revenueNetCents)}</td>
                    <td className="px-4 py-2.5">{euros(o.foodCostCents)}</td>
                    <td className="px-4 py-2.5">{euros(o.platformFeeCents)}</td>
                    <td className="px-4 py-2.5 font-semibold">{euros(o.marginCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ordersComplete.length > 0 && (
          <p className="border-t border-[var(--p-line)] px-4 py-3 text-xs text-[var(--p-muted)]">
            {ordersComplete.length} pedidos con escandallo completo · margen medio{" "}
            {euros(ordersComplete.reduce((a, o) => a + o.marginCents, 0) / ordersComplete.length)}
          </p>
        )}
      </section>

      <GastosFijos form={form} set={set} period={data.period} />
    </div>
  );
}

function PctField({ label, value, onChange, hint, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; hint: string; min?: number; max: number }) {
  return (
    <label className="block">
      <span className="text-sm text-[var(--p-muted)]">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input type="number" inputMode="decimal" min={min} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))} className="w-24 rounded-lg border border-[var(--p-line)] px-2 py-1 text-xl font-bold" />
        <span className="text-xl font-bold">%</span>
      </span>
      <span className="mt-1 block text-xs text-[var(--p-muted)]">{hint}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4">
      <div className="text-sm text-[var(--p-muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
