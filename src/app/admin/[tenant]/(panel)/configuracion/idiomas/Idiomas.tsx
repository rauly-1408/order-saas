"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readPanelCache, writePanelCache } from "../../panelCache";
import { Card, Toggle, ghostBtn, input, toast, useSaveBar } from "../ui";

// Carta en inglés. La traducción es automática: al activar el inglés y cada vez
// que se añade o cambia algo de la carta, la IA traduce lo pendiente. Abajo,
// plegado, queda todo para corregir a mano lo que no convenza.
// Ver docs/CARTA-IDIOMAS.md

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

export default function Idiomas({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/translations`;
  const cacheKey = `idiomas:${tenant}`;
  const [data, setData] = useState<Data | null>(() => readPanelCache<Data>(cacheKey) ?? null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const autoRan = useRef(false);

  const reload = useCallback(async () => {
    const res = await fetch(api, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los textos");
    setData(json);
    writePanelCache(cacheKey, json);
    return json as Data;
  }, [api, cacheKey]);

  const translate = useCallback(
    async (mode: "missing" | "all") => {
      setTranslating(true);
      try {
        const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "No se pudo traducir");
        await reload();
        if (json.translated) toast(`${json.translated} ${json.translated === 1 ? "texto traducido" : "textos traducidos"}`);
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo traducir", false);
      } finally {
        setTranslating(false);
      }
    },
    [api, reload]
  );

  // Al entrar: si el inglés está activo y falta algo, se traduce solo.
  useEffect(() => {
    reload()
      .then((d) => {
        if (!autoRan.current && d.english && d.aiEnabled && d.texts.some((t) => !t.en)) {
          autoRan.current = true;
          translate("missing");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los textos"));
  }, [reload, translate]);

  const keyOf = (t: MenuText) => `${t.ref}|${t.field}`;

  // Correcciones a mano: barra «Cambios sin guardar».
  useSaveBar("idiomas", {
    dirty: Object.keys(edits).length > 0,
    discard: () => setEdits({}),
    save: async () => {
      const items = Object.entries(edits).map(([k, en]) => {
        const [ref, field] = k.split("|");
        return { ref, field, en };
      });
      const res = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      if (!res.ok) {
        toast("No se pudieron guardar las traducciones", false);
        return false;
      }
      setEdits({});
      await reload();
      return true;
    },
  });

  async function toggleEnglish(on: boolean) {
    const res = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ english: on }) });
    if (!res.ok) return toast("No se pudo cambiar", false);
    const d = await reload();
    toast(on ? "Tu tienda ya muestra el botón ES / EN" : "Tu tienda se muestra solo en español");
    // Al activarlo, se traduce todo lo que falte.
    if (on && d.aiEnabled && d.texts.some((t) => !t.en)) translate("missing");
  }

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const out = new Map<string, MenuText[]>();
    for (const t of data?.texts ?? []) {
      if (q && !`${t.es} ${t.en ?? ""} ${t.context ?? ""}`.toLowerCase().includes(q)) continue;
      out.set(t.kind, [...(out.get(t.kind) ?? []), t]);
    }
    return [...out.entries()];
  }, [data, q]);

  if (!data) return error ? <p className="text-sm text-[var(--p-accent)]">{error}</p> : <p className="py-10 text-sm text-[var(--p-muted)]">Cargando…</p>;
  const total = data.texts.length;
  const missing = data.texts.filter((t) => !t.en).length;
  const toggleGroup = (k: string) => setOpen((o) => (o.has(k) ? new Set([...o].filter((x) => x !== k)) : new Set([...o, k])));

  return (
    <div className="space-y-5">
      <Card title="🇬🇧 Carta en inglés" description="Tus clientes extranjeros ven la tienda en inglés con el botón ES / EN (si su móvil está en inglés, sale sola). La cocina recibe los pedidos en español.">
        <Toggle checked={data.english} onChange={toggleEnglish} label="Mostrar mi tienda también en inglés" />
        {data.english && (
          <div className={`mt-3 rounded-xl px-4 py-3 text-sm ${translating ? "bg-sky-50 text-sky-800" : missing ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>
            {translating ? (
              <p className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700" aria-hidden />
                Traduciendo tu carta… (unos segundos)
              </p>
            ) : missing ? (
              <p>
                {missing} de {total} textos sin traducir.{" "}
                {data.aiEnabled ? (
                  <button type="button" onClick={() => translate("missing")} className="font-semibold underline">
                    Traducir ahora
                  </button>
                ) : (
                  "La traducción automática no está disponible: puedes escribirlos abajo."
                )}
              </p>
            ) : (
              <p>
                ✓ <b>Todo traducido</b> ({total} textos). Cuando añadas o cambies algo de la carta, se traduce solo.
              </p>
            )}
          </div>
        )}
      </Card>

      {data.english && (
        <Card
          title="Revisar traducciones"
          description="Solo si algo no te convence: abre el grupo, cambia el texto y guarda. Si cambias un texto en español, su traducción se rehace sola."
          footer={
            data.aiEnabled && (
              <button
                type="button"
                disabled={translating}
                onClick={() => confirm("¿Volver a traducir toda la carta? Se pierden tus correcciones.") && translate("all")}
                className={`${ghostBtn} text-xs`}
              >
                Rehacer toda la traducción
              </button>
            )
          }
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar un texto (p. ej. mollete, patatas…)" className={`${input} !mt-0`} aria-label="Buscar un texto" />
          <div className="mt-3 divide-y divide-[var(--p-line)] overflow-hidden rounded-xl border border-[var(--p-line)]">
            {groups.length === 0 && <p className="px-4 py-3 text-sm text-[var(--p-muted)]">Nada coincide con «{query}».</p>}
            {groups.map(([kind, list]) => {
              const isOpen = open.has(kind) || !!q;
              const pending = list.filter((t) => !t.en).length;
              return (
                <div key={kind}>
                  <button type="button" onClick={() => toggleGroup(kind)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-black/[0.03]">
                    <span aria-hidden className={`text-[var(--p-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}>
                      ›
                    </span>
                    <span className="flex-1 font-semibold">{KIND_LABEL[kind] ?? kind}</span>
                    {pending > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{pending} sin traducir</span>}
                    <span className="text-xs text-[var(--p-muted)] tabular-nums">{list.length}</span>
                  </button>
                  {isOpen && (
                    <ul className="divide-y divide-[var(--p-line)] bg-black/[0.015]">
                      {list.map((t) => {
                        const k = keyOf(t);
                        const value = edits[k] ?? t.en ?? "";
                        const long = t.field === "description";
                        const set = (v: string) => setEdits((e) => {
                          const next = { ...e };
                          if (v === (t.en ?? "")) delete next[k];
                          else next[k] = v;
                          return next;
                        });
                        return (
                          <li key={k} className="grid gap-2 px-4 py-3 sm:grid-cols-2 sm:gap-4">
                            <div className="min-w-0 text-sm">
                              <p className="text-[11px] uppercase tracking-wide text-[var(--p-faint)]">
                                {long ? "Descripción" : "Nombre"}
                                {t.context ? ` · ${t.context}` : ""}
                              </p>
                              <p className="mt-0.5">{t.es}</p>
                            </div>
                            {long ? (
                              <textarea value={value} onChange={(e) => set(e.target.value)} rows={2} placeholder="Sin traducir (se muestra en español)" aria-label={`Inglés: ${t.es}`} className={`${input} !mt-0`} />
                            ) : (
                              <input value={value} onChange={(e) => set(e.target.value)} placeholder="Sin traducir (se muestra en español)" aria-label={`Inglés: ${t.es}`} className={`${input} !mt-0`} />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
