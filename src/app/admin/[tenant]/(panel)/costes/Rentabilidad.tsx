"use client";

import { useMemo, useState } from "react";
import { foodCostHealth, margin, suggestedGrossPriceCents, type Health } from "@/app/lib/costs";
import { euros, linesCost, typicalPlate, type Ingredient, type Overview } from "./types";

const HEALTH_CLS: Record<Health, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-600",
  unknown: "bg-[var(--p-bg)] text-[var(--p-muted)]",
};

type Props = { data: Overview; api: string; onSaved: () => Promise<void>; onGoToRecipes: () => void };

export default function Rentabilidad({ data, api, onSaved, onGoToRecipes }: Props) {
  const [target, setTarget] = useState(30); // food cost objetivo %
  const [applying, setApplying] = useState<string | null>(null);

  // Aplica el precio sugerido en la carta. El sugerido es del plato típico
  // (con opciones por defecto), así que al precio base se le restan sus suplementos.
  async function applyPrice(r: { id: string; name: string; priceCents: number; suggested: number; defaultsDelta: number; basePriceCents: number }) {
    const newBase = r.suggested - r.defaultsDelta;
    if (!window.confirm(`¿Cambiar el precio de ${r.name} en la carta de ${euros(r.basePriceCents)} a ${euros(newBase)}?`)) return;
    setApplying(r.id);
    const productsApi = api.replace(/\/costs$/, "/products");
    await fetch(`${productsApi}/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basePriceCents: newBase }) });
    await onSaved();
    setApplying(null);
  }
  const ingredients = useMemo(() => new Map<string, Ingredient>(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);

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
          health: plate.missing === "receta" ? ("unknown" as Health) : foodCostHealth(m.foodCostPct, target),
          suggested: suggestedGrossPriceCents(cost, target),
        };
      })
      .sort((a, b) => (b.m.foodCostPct ?? -1) - (a.m.foodCostPct ?? -1));
  }, [data.categories, ingredients, target]);

  const withRecipe = rows.filter((r) => r.missing !== "receta");
  const avgFoodCost = withRecipe.length ? withRecipe.reduce((a, r) => a + (r.m.foodCostPct ?? 0), 0) / withRecipe.length : null;
  const ordersComplete = data.orders.filter((o) => o.complete);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Platos escandallados" value={`${withRecipe.length} / ${rows.length}`} />
        <Stat label="Food cost medio" value={avgFoodCost == null ? "—" : `${avgFoodCost.toFixed(1)} %`} />
        <label className="rounded-xl border border-[var(--p-line)] bg-white p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--p-faint)]">Food cost objetivo</span>
          <span className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={80}
              value={target}
              onChange={(e) => setTarget(Math.min(80, Math.max(5, Number(e.target.value) || 30)))}
              className="w-20 rounded-lg border border-[var(--p-line)] px-2 py-1 text-xl font-bold"
            />
            <span className="text-xl font-bold">%</span>
          </span>
        </label>
      </div>

      {withRecipe.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--p-brand-soft)] bg-white p-6 text-center">
          <p className="font-semibold">Aún no hay platos escandallados</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">Crea tus ingredientes y añade sus cantidades a cada plato para ver tu margen.</p>
          <button onClick={onGoToRecipes} className="mt-4 rounded-lg bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
            Ir a escandallos
          </button>
        </div>
      )}

      <section className="rounded-xl border border-[var(--p-line)] bg-white">
        <h2 className="border-b border-[var(--p-line)] px-4 py-3 text-xs font-bold uppercase tracking-wider">Margen por plato</h2>
        <p className="px-4 pt-3 text-xs text-[var(--p-muted)]">
          Plato tal como sale de cocina (con el pan y la guarnición por defecto). Precios sin IVA (10 %).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--p-muted)]">
                {["Plato", "Precio", "Coste", "Margen", "Food cost", "Precio sugerido"].map((h) => (
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
                    {r.missing === "receta" || r.health === "good" ? (
                      "—"
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--p-brand-strong)]">{euros(r.suggested)}</span>
                        <button
                          onClick={() => applyPrice(r)}
                          disabled={applying === r.id}
                          className="rounded-md border border-[var(--p-brand)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-brand)] hover:bg-[var(--p-brand)] hover:text-white disabled:opacity-50"
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

      <section className="rounded-xl border border-[var(--p-line)] bg-white">
        <h2 className="border-b border-[var(--p-line)] px-4 py-3 text-xs font-bold uppercase tracking-wider">Margen real de los últimos pedidos</h2>
        <p className="px-4 pt-3 text-xs text-[var(--p-muted)]">
          Con las opciones que eligió cada cliente. Ingresos sin IVA, sin gastos de envío; se descuenta la comisión de la plataforma.
        </p>
        {data.orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--p-muted)]">Todavía no hay pedidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[var(--p-muted)]">
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--p-line)] bg-white p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-[var(--p-faint)]">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
