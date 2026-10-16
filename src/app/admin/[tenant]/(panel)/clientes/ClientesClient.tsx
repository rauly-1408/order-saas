"use client";

import { useCallback, useEffect, useState } from "react";
import type { Overview } from "./types";
import { readPanelCache, writePanelCache } from "../panelCache";
import Clientes from "./Clientes";
import Campanas from "./Campanas";
import Cupones from "./Cupones";
import Promociones from "./Promociones";
import Fidelizacion from "./Fidelizacion";
import Resenas from "./Resenas";

const TABS = [
  { key: "clientes", label: "Clientes" },
  { key: "campanas", label: "Campañas" },
  { key: "cupones", label: "Cupones" },
  { key: "promociones", label: "Promociones" },
  { key: "fidelizacion", label: "Fidelización" },
  { key: "resenas", label: "Reseñas" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function ClientesClient({ tenant }: { tenant: string }) {
  const [tab, setTab] = useState<TabKey>("clientes");
  const [data, setData] = useState<Overview | null>(() => readPanelCache<Overview>(`clientes:${tenant}`) ?? null);
  const [error, setError] = useState("");
  const api = `/api/admin/${tenant}/retention`;

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`${api}/overview`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los datos");
      setData(json as Overview);
      writePanelCache(`clientes:${tenant}`, json as Overview);
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
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Clientes</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Quién te pide, quién ha dejado de hacerlo y cómo hacer que vuelva</p>

      <nav className="mt-6 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={(e) => {
              setTab(t.key);
              // En móvil la barra se desplaza: que la pestaña elegida quede a la vista.
              e.currentTarget.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
            }}
            className={`p-press shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
              tab === t.key ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)] hover:text-[var(--p-ink)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="mb-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>}
      {!data ? (
        !error && <div className="py-16 text-center text-[var(--p-muted)]">Cargando…</div>
      ) : tab === "clientes" ? (
        <Clientes data={data} api={api} onSaved={reload} onNewCampaign={() => setTab("campanas")} />
      ) : tab === "campanas" ? (
        <Campanas data={data} api={api} onSaved={reload} onGoToCoupons={() => setTab("cupones")} />
      ) : tab === "cupones" ? (
        <Cupones data={data} api={api} onSaved={reload} />
      ) : tab === "promociones" ? (
        <Promociones data={data} api={api} onSaved={reload} />
      ) : tab === "fidelizacion" ? (
        <Fidelizacion data={data} api={api} onSaved={reload} />
      ) : (
        <Resenas tenant={tenant} />
      )}
    </div>
  );
}
