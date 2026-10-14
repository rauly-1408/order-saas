"use client";

import { useMemo, useState } from "react";
import { foodCostHealth, margin, suggestedGrossPriceCents, type Health } from "@/app/lib/costs";
import { euros, linesCost, typicalPlate, type Ingredient, type Overview } from "./types";

const HEALTH_CLS: Record<Health, string> = {
  good: "bg-emerald-50 text-emerald-700",
  warn: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-600",
  unknown: "bg-[#f7f7fb] text-[#6b6890]",
};

export default function Rentabilidad({ data, onGoToRecipes }: { data: Overview; onGoToRecipes: () => void }) {
  const [target, setTarget] = useState(30); // food cost objetivo %
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
        <label className="rounded-xl border border-[#eaeaf4] bg-white p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-[#b8b6df]">Food cost objetivo</span>
          <span className="mt-1 flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={80}
              value={target}
              onChange={(e) => setTarget(Math.min(80, Math.max(5, Number(e.target.value) || 30)))}
              className="w-20 rounded-lg border border-[#eaeaf4] px-2 py-1 text-xl font-bold"
            />
            <span className="text-xl font-bold">%</span>
          </span>
        </label>
      </div>

      {withRecipe.length === 0 && (
        <div className="rounded-xl border border-dashed border-[#e0d1ff] bg-white p-6 text-center">
          <p className="font-semibold">Aún no hay platos escandallados</p>
          <p className="mt-1 text-sm text-[#6b6890]">Crea tus ingredientes y añade sus cantidades a cada plato para ver tu margen.</p>
          <button onClick={onGoToRecipes} className="mt-4 rounded-lg bg-[#7939fe] px-4 py-2 text-sm font-semibold text-white">
            Ir a escandallos
          </button>
        </div>
      )}

      <section className="rounded-xl border border-[#eaeaf4] bg-white">
        <h2 className="border-b border-[#eaeaf4] px-4 py-3 text-xs font-bold uppercase tracking-wider">Margen por plato</h2>
        <p className="px-4 pt-3 text-xs text-[#6b6890]">
          Plato tal como sale de cocina (con el pan y la guarnición por defecto). Precios sin IVA (10 %).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-[#6b6890]">
                {["Plato", "Precio", "Coste", "Margen", "Food cost", "Precio sugerido"].map((h) => (
                  <th key={h} className="px-4 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eaeaf4]">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-xs text-[#6b6890]">{r.category}</div>
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
                    {r.missing === "receta" || r.health === "good" ? "—" : <span className="font-semibold text-[#5707fd]">{euros(r.suggested)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[#eaeaf4] bg-white">
        <h2 className="border-b border-[#eaeaf4] px-4 py-3 text-xs font-bold uppercase tracking-wider">Margen real de los últimos pedidos</h2>
        <p className="px-4 pt-3 text-xs text-[#6b6890]">
          Con las opciones que eligió cada cliente. Ingresos sin IVA, sin gastos de envío; se descuenta la comisión de la plataforma.
        </p>
        {data.orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#6b6890]">Todavía no hay pedidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-[#6b6890]">
                  {["Pedido", "Ingresos", "Ingredientes", "Comisión", "Margen"].map((h) => (
                    <th key={h} className="px-4 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eaeaf4]">
                {data.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5">
                      <span className="font-semibold">#{o.orderNumber}</span> <span className="text-[#6b6890]">{o.customerName}</span>
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
          <p className="border-t border-[#eaeaf4] px-4 py-3 text-xs text-[#6b6890]">
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
    <div className="rounded-xl border border-[#eaeaf4] bg-white p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-[#b8b6df]">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
