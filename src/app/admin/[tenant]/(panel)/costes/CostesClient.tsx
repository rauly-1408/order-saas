"use client";

import { useCallback, useEffect, useState } from "react";
import type { Overview } from "./types";
import Rentabilidad from "./Rentabilidad";
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
  { key: "ingredientes", label: "Ingredientes" },
  { key: "proveedores", label: "Proveedores" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function CostesClient({ tenant }: { tenant: string }) {
  const [tab, setTab] = useState<TabKey>("rentabilidad");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const api = `/api/admin/${tenant}/costs`;

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${api}/overview`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los datos");
      setData(json as Overview);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los datos");
    }
  }, [api]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="text-[var(--p-ink)]">
      <h1 className="text-2xl font-bold">Costes y margen</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Escandallos, ingredientes y lo que ganas en cada plato</p>

      <nav className="mt-5 mb-5 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
              tab === t.key ? "bg-[var(--p-brand)] text-white" : "text-[var(--p-muted)] hover:bg-[var(--p-bg)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
      {!data ? (
        !error && <div className="py-16 text-center text-[var(--p-muted)]">Cargando…</div>
      ) : tab === "rentabilidad" ? (
        <Rentabilidad data={data} api={api} onSaved={reload} onGoToRecipes={() => setTab("escandallos")} />
      ) : tab === "compras" ? (
        <Compras data={data} api={api} onSaved={reload} />
      ) : tab === "inventario" ? (
        <Inventario data={data} api={api} onSaved={reload} />
      ) : tab === "escandallos" ? (
        <Escandallos data={data} api={api} onSaved={reload} onGoToIngredients={() => setTab("ingredientes")} />
      ) : tab === "ingredientes" ? (
        <Ingredientes data={data} api={api} onSaved={reload} />
      ) : (
        <Proveedores data={data} api={api} onSaved={reload} />
      )}
    </div>
  );
}
