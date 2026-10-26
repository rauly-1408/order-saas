"use client";

import { useCallback, useEffect, useState } from "react";
import type { Overview } from "./types";
import { readPanelCache, writePanelCache } from "../panelCache";
import Rentabilidad from "./Rentabilidad";
import Elaboraciones from "./Elaboraciones";
import Consumibles from "./Consumibles";
import Escandallos from "./Escandallos";
import Ingredientes from "./Ingredientes";
import Proveedores from "./Proveedores";
import Inventario from "./Inventario";
import Compras from "./Compras";

const TABS = [
  { key: "rentabilidad", label: "Rentabilidad" },
  { key: "inventario", label: "Inventario" },
  { key: "compras", label: "Compras" },
  { key: "escandallos", label: "Escandallos" },
  { key: "elaboraciones", label: "Elaboraciones" },
  { key: "ingredientes", label: "Ingredientes" },
  { key: "consumibles", label: "Consumibles" },
  { key: "proveedores", label: "Proveedores" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// Primeros pasos: el orden en que conviene rellenar Costes. Desaparece cuando
// están los cuatro hechos.
function FirstSteps({ data, onGo }: { data: Overview; onGo: (t: TabKey) => void }) {
  const products = data.categories.flatMap((c) => c.products);
  const steps: { tab: TabKey; title: string; hint: string; done: boolean }[] = [
    { tab: "proveedores", title: "Añade tus proveedores", hint: "A quién compras y cómo le pides (WhatsApp, email…).", done: data.suppliers.length > 0 },
    { tab: "ingredientes", title: "Da de alta los ingredientes con su precio", hint: "El precio de compra es la base del coste de cada plato.", done: data.ingredients.length > 0 },
    {
      tab: "escandallos",
      title: "Haz el escandallo de tus platos",
      hint: "Qué lleva cada plato y en qué cantidad: así sale lo que ganas.",
      done: products.some((p) => p.recipeLines.length > 0 || p.modifierGroups.some((g) => g.group.options.some((o) => o.recipeLines.length > 0))),
    },
    { tab: "inventario", title: "Controla el stock", hint: "Marca qué ingredientes cuentas para que se descuenten con cada venta.", done: data.ingredients.some((i) => i.trackStock) },
  ];
  const done = steps.filter((x) => x.done).length;
  if (done === steps.length) return null;
  const next = steps.findIndex((x) => !x.done);
  return (
    <section aria-label="Primeros pasos" className="mb-6 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Primeros pasos</h2>
        <span className="shrink-0 text-xs text-[var(--p-muted)]">
          {done} de {steps.length}
        </span>
      </div>
      <ol className="mt-3 space-y-1">
        {steps.map((x, i) => (
          <li key={x.tab}>
            <button type="button" onClick={() => onGo(x.tab)} className={`p-press flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-black/[0.03] ${i === next ? "bg-[var(--p-brand-soft)]" : ""}`}>
              <span aria-hidden className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${x.done ? "bg-emerald-100 text-emerald-700" : i === next ? "bg-[var(--p-brand)] text-white" : "bg-black/[0.06] text-[var(--p-muted)]"}`}>
                {x.done ? "✓" : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${x.done ? "text-[var(--p-muted)] line-through" : ""}`}>{x.title}</span>
                {!x.done && <span className="block text-xs text-[var(--p-muted)]">{x.hint}</span>}
              </span>
              {!x.done && <span aria-hidden className="mt-0.5 text-[var(--p-faint)]">›</span>}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function CostesClient({ tenant }: { tenant: string }) {
  const [tab, setTab] = useState<TabKey>("rentabilidad");
  const [data, setData] = useState<Overview | null>(() => readPanelCache<Overview>(`costes:${tenant}`) ?? null);
  const [error, setError] = useState("");
  const api = `/api/admin/${tenant}/costs`;

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${api}/overview`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los datos");
      setData(json as Overview);
      writePanelCache(`costes:${tenant}`, json as Overview);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos");
    }
  }, [api, tenant]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Costes y margen</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Escandallos, ingredientes y lo que ganas en cada plato</p>

      <nav className="mt-6 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`p-press shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
              tab === t.key ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)] hover:text-[var(--p-ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {data && <FirstSteps data={data} onGo={setTab} />}
      {error && <div className="mb-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>}
      {!data ? (
        !error && <div className="py-16 text-center text-[var(--p-muted)]">Cargando…</div>
      ) : tab === "rentabilidad" ? (
        <Rentabilidad data={data} api={api} onSaved={reload} onGoToRecipes={() => setTab("escandallos")} />
      ) : tab === "compras" ? (
        <Compras data={data} api={api} onSaved={reload} />
      ) : tab === "inventario" ? (
        <Inventario data={data} api={api} onSaved={reload} onGoToIngredients={() => setTab("ingredientes")} />
      ) : tab === "escandallos" ? (
        <Escandallos data={data} api={api} onSaved={reload} onGoToIngredients={() => setTab("ingredientes")} />
      ) : tab === "elaboraciones" ? (
        <Elaboraciones data={data} api={api} onSaved={reload} onGoToIngredients={() => setTab("ingredientes")} />
      ) : tab === "consumibles" ? (
        <Consumibles data={data} api={api} onSaved={reload} />
      ) : tab === "ingredientes" ? (
        <Ingredientes data={data} api={api} onSaved={reload} />
      ) : (
        <Proveedores data={data} api={api} onSaved={reload} />
      )}
    </div>
  );
}
