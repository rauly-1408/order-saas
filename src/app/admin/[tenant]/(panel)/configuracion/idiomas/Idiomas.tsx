"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readPanelCache, writePanelCache } from "../../panelCache";

// Carta en inglés: traducción con IA en un clic, revisión a mano y el botón
// ES / EN de la tienda. La cocina sigue viendo los pedidos en español.

type MenuText = { ref: string; kind: string; field: string; es: string; en: string | null; context?: string };
type Data = { texts: MenuText[]; english: boolean; aiEnabled: boolean };

const KIND_LABEL: Record<string, string> = {
  category: "Categorías",
  product: "Productos",
  group: "Grupos de opciones",
  option: "Opciones (pan, salsas, extras…)",
  slot: "Pasos de los menús",
  promotion: "Promociones",
  loyalty: "Tarjeta de sellos",
};
const card = "rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

export default function Idiomas({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/translations`;
  const cacheKey = `idiomas:${tenant}`;
  const [data, setData] = useState<Data | null>(() => readPanelCache<Data>(cacheKey) ?? null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"" | "ai" | "save" | "toggle">("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(api, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los textos");
    setData(json);
    writePanelCache(cacheKey, json);
  }, [api, cacheKey]);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los textos"));
  }, [reload]);

  const keyOf = (t: MenuText) => `${t.ref}|${t.field}`;
  const total = data?.texts.length ?? 0;
  const done = data?.texts.filter((t) => t.en).length ?? 0;
  const dirty = Object.keys(edits).length > 0;
  const groups = useMemo(() => {
    const out = new Map<string, MenuText[]>();
    for (const t of data?.texts ?? []) {
      if (onlyMissing && t.en) continue;
      out.set(t.kind, [...(out.get(t.kind) ?? []), t]);
    }
    return [...out.entries()];
  }, [data, onlyMissing]);

  async function run(fn: () => Promise<string>, kind: "ai" | "save" | "toggle") {
    setBusy(kind);
    setError("");
    setMsg("");
    try {
      setMsg(await fn());
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo ha fallado");
    } finally {
      setBusy("");
    }
  }

  const translate = (mode: "missing" | "all") =>
    run(async () => {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo traducir");
      setEdits({});
      return json.translated ? `Listo: ${json.translated} textos traducidos. Revísalos abajo si quieres.` : "No había textos pendientes de traducir.";
    }, "ai");

  const save = () =>
    run(async () => {
      const items = Object.entries(edits).map(([k, en]) => {
        const [ref, field] = k.split("|");
        return { ref, field, en };
      });
      const res = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      if (!res.ok) throw new Error("No se pudieron guardar las traducciones");
      setEdits({});
      return "Traducciones guardadas.";
    }, "save");

  const toggle = (english: boolean) =>
    run(async () => {
      const res = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ english }) });
      if (!res.ok) throw new Error("No se pudo cambiar");
      return english ? "La tienda ya muestra el botón ES / EN." : "La tienda solo se muestra en español.";
    }, "toggle");

  if (!data) return error ? <p className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p> : <p className="py-16 text-center text-[var(--p-muted)]">Cargando…</p>;

  return (
    <div className="space-y-4">
      <section className={`${card} p-5`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[15px] font-semibold">🇬🇧 Carta en inglés</p>
            <p className="mt-0.5 max-w-xl text-sm text-[var(--p-muted)]">
              Tus clientes extranjeros verán la tienda en inglés (botón ES / EN; si su móvil está en inglés, sale sola). La cocina recibe los pedidos en español.
            </p>
            <p className="mt-2 text-sm">
              <span className="font-semibold tabular-nums">
                {done} de {total}
              </span>{" "}
              <span className="text-[var(--p-muted)]">textos traducidos</span>
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={data.english} disabled={!!busy} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4 accent-[var(--p-brand)]" />
            Mostrar en inglés
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => translate("missing")} disabled={!!busy || !data.aiEnabled || done === total} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {busy === "ai" ? "Traduciendo… (puede tardar un minuto)" : done ? `✨ Traducir lo que falta (${total - done})` : "✨ Traducir la carta con IA"}
          </button>
          {done > 0 && (
            <button onClick={() => confirm("¿Volver a traducir toda la carta? Se sustituyen también tus correcciones.") && translate("all")} disabled={!!busy || !data.aiEnabled} className="p-press rounded-full px-4 py-2 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.04] disabled:opacity-40">
              Rehacer todo
            </button>
          )}
        </div>
        {!data.aiEnabled && <p className="mt-2 text-xs text-[var(--p-muted)]">La IA no está configurada en este entorno: puedes escribir las traducciones a mano.</p>}
        {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}
        {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="h-4 w-4 accent-[var(--p-brand)]" />
          Ver solo lo que falta por traducir
        </label>
        <button onClick={save} disabled={!dirty || !!busy} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          {busy === "save" ? "Guardando…" : `Guardar correcciones${dirty ? ` (${Object.keys(edits).length})` : ""}`}
        </button>
      </div>

      {groups.map(([kind, list]) => (
        <section key={kind} className={`${card} overflow-hidden`}>
          <p className="border-b border-[var(--p-line)] px-4 py-3 text-sm font-semibold sm:px-5">
            {KIND_LABEL[kind] ?? kind} <span className="font-normal text-[var(--p-muted)]">· {list.length}</span>
          </p>
          <ul className="divide-y divide-[var(--p-line)]">
            {list.map((t) => {
              const k = keyOf(t);
              const value = edits[k] ?? t.en ?? "";
              const long = t.field === "description";
              return (
                <li key={k} className="grid gap-2 px-4 py-3 sm:grid-cols-2 sm:gap-4 sm:px-5">
                  <div className="min-w-0 text-sm">
                    <p className="text-[11px] uppercase tracking-wide text-[var(--p-faint)]">
                      {t.field === "description" ? "Descripción" : "Nombre"}
                      {t.context ? ` · ${t.context}` : ""}
                    </p>
                    <p className="mt-0.5">{t.es}</p>
                  </div>
                  {long ? (
                    <textarea
                      value={value}
                      onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                      rows={2}
                      placeholder="Sin traducir (se muestra en español)"
                      aria-label={`Inglés: ${t.es}`}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  ) : (
                    <input
                      value={value}
                      onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}
                      placeholder="Sin traducir (se muestra en español)"
                      aria-label={`Inglés: ${t.es}`}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
