"use client";

import { ask } from "@/app/lib/dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { readPanelCache, writePanelCache } from "../panelCache";
import { Sheet } from "../mesas/shared";
import { Switch } from "./CartaClient";

// Carta → Opciones: lo que el cliente elige al pedir (pan, guarnición, extras,
// salsas…). Cada grupo tiene sus opciones con precio y se aplica a los productos
// que se marquen. Ver docs/OPCIONES.md

type Option = { id?: string; name: string; priceDeltaCents: number; isAvailable: boolean };
type Group = { id: string; name: string; isRequired: boolean; minSelect: number; maxSelect: number; options: Required<Option>[]; productIds: string[] };
type Category = { id: string; name: string; products: { id: string; name: string }[] };
type Data = { groups: Group[]; categories: Category[] };
type Form = { id: string | null; name: string; isRequired: boolean; multiple: boolean; maxSelect: string; options: (Option & { price: string; key: string })[]; productIds: Set<string> };

const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const toCents = (v: string) => Math.round(Number((v || "0").replace(",", ".")) * 100);
const toText = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");
const input = "w-full min-w-0 rounded-xl border border-[var(--p-line)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--p-brand)]";
let keySeq = 0;
const newKey = () => `k${++keySeq}`;

function toForm(g: Group | null): Form {
  return {
    id: g?.id ?? null,
    name: g?.name ?? "",
    isRequired: g?.isRequired ?? false,
    multiple: (g?.maxSelect ?? 1) > 1,
    maxSelect: String(g && g.maxSelect > 1 ? g.maxSelect : 3),
    options: (g?.options ?? [{ name: "", priceDeltaCents: 0, isAvailable: true }]).map((o) => ({ ...o, price: toText(o.priceDeltaCents), key: newKey() })),
    productIds: new Set(g?.productIds ?? []),
  };
}

// Cómo se elige, en palabras: «Obligatorio · elige 1», «Opcional · hasta 3».
const ruleText = (g: { isRequired: boolean; maxSelect: number }) => `${g.isRequired ? "Obligatorio" : "Opcional"} · ${g.maxSelect > 1 ? `hasta ${g.maxSelect}` : "elige 1"}`;

export default function Opciones({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/opciones`;
  const cacheKey = `opciones:${tenant}`;
  const [data, setData] = useState<Data | null>(() => readPanelCache<Data>(cacheKey) ?? null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar las opciones");
      setData(json);
      writePanelCache(cacheKey, json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las opciones");
    }
  }, [api, cacheKey]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const productName = useMemo(() => new Map((data?.categories ?? []).flatMap((c) => c.products.map((p) => [p.id, p.name] as const))), [data]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        id: form.id,
        name: form.name,
        isRequired: form.isRequired,
        multiple: form.multiple,
        maxSelect: Number(form.maxSelect) || 2,
        options: form.options.map((o) => ({ id: o.id, name: o.name, priceDeltaCents: toCents(o.price), isAvailable: o.isAvailable })),
        productIds: [...form.productIds],
      };
      const res = await fetch(api, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      setForm(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    const n = form.productIds.size;
    if (!(await ask(`¿Borrar el grupo «${form.name}»?${n ? ` Se quitará de ${n} ${n === 1 ? "producto" : "productos"}.` : ""} Los pedidos ya hechos no cambian.`, { confirm: "Borrar", danger: true }))) return;
    setSaving(true);
    try {
      const res = await fetch(`${api}?id=${encodeURIComponent(form.id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "No se pudo borrar");
      setForm(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    } finally {
      setSaving(false);
    }
  }

  const setOpt = (key: string, patch: Partial<Form["options"][number]>) => form && setForm({ ...form, options: form.options.map((o) => (o.key === key ? { ...o, ...patch } : o)) });
  const moveOpt = (i: number, dir: -1 | 1) => {
    if (!form) return;
    const j = i + dir;
    if (j < 0 || j >= form.options.length) return;
    const options = [...form.options];
    [options[i], options[j]] = [options[j], options[i]];
    setForm({ ...form, options });
  };
  const toggleProducts = (ids: string[], on: boolean) => {
    if (!form) return;
    const next = new Set(form.productIds);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    setForm({ ...form, productIds: next });
  };

  if (!data) return <p className="py-10 text-center text-sm text-[var(--p-muted)]">{error || "Cargando opciones…"}</p>;

  const groups = data.groups.filter((g) => !q.trim() || g.name.toLowerCase().includes(q.trim().toLowerCase()) || g.options.some((o) => o.name.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar grupo u opción…" aria-label="Buscar grupo u opción" className="min-w-0 flex-1 rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]" />
        <button type="button" onClick={() => setForm(toForm(null))} className="p-press shrink-0 rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white">
          + Nuevo grupo
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--p-muted)]">Lo que el cliente elige al pedir: el pan, la guarnición, los extras, las salsas… Cada grupo se puede usar en muchos productos.</p>
      {error && !form && <p className="mt-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}

      {groups.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-[var(--p-surface)] p-8 text-center">
          <p className="font-medium">{q ? "No hay grupos que coincidan" : "Todavía no hay grupos de opciones"}</p>
          {!q && <p className="mt-1 text-sm text-[var(--p-muted)]">Crea uno, por ejemplo «Elige tu pan» o «Añade extras».</p>}
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => setForm(toForm(g))} className="p-lift flex h-full w-full flex-col rounded-2xl bg-[var(--p-surface)] p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <span className="flex w-full items-start justify-between gap-3">
                  <span className="min-w-0 font-semibold">{g.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.isRequired ? "bg-[var(--p-brand-soft)] text-[var(--p-brand)]" : "bg-black/[0.05] text-[var(--p-muted)]"}`}>{ruleText(g)}</span>
                </span>
                <span className="mt-1.5 line-clamp-2 text-sm text-[var(--p-muted)]">
                  {g.options.map((o) => `${o.name}${o.priceDeltaCents ? ` (+${eur(o.priceDeltaCents)})` : ""}${o.isAvailable ? "" : " · agotado"}`).join(" · ")}
                </span>
                <span className="mt-auto pt-3 text-xs text-[var(--p-faint)]">
                  {g.options.length} {g.options.length === 1 ? "opción" : "opciones"} · {g.productIds.length ? `en ${g.productIds.length} ${g.productIds.length === 1 ? "producto" : "productos"}` : "sin productos"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <Sheet
          title={form.id ? "Editar grupo" : "Nuevo grupo de opciones"}
          onClose={() => !saving && setForm(null)}
          wide
          footer={
            <div className="flex items-center gap-2">
              {form.id && (
                <button type="button" onClick={remove} disabled={saving} className="p-press mr-auto rounded-full px-3 py-2.5 text-sm font-medium text-[var(--p-accent)]">
                  Eliminar
                </button>
              )}
              <button type="button" onClick={() => setForm(null)} disabled={saving} className="p-press ml-auto rounded-full border border-[var(--p-line)] px-4 py-2.5 text-sm font-medium">
                Cancelar
              </button>
              <button type="button" onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          }
        >
          <div className="space-y-5 py-1">
            <label className="block text-sm font-medium">
              Nombre del grupo
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Elige tu pan" className={`mt-1 ${input}`} />
              <span className="mt-1 block text-xs font-normal text-[var(--p-muted)]">Es la pregunta que verá el cliente.</span>
            </label>

            {/* Cómo se elige */}
            <div>
              <p className="text-sm font-medium">¿Cuántas puede elegir?</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <div className="grid grid-cols-2 rounded-full bg-black/[0.05] p-1 text-sm font-medium">
                  {([false, true] as const).map((m) => (
                    <button key={String(m)} type="button" aria-pressed={form.multiple === m} onClick={() => setForm({ ...form, multiple: m })} className={`rounded-full px-4 py-1.5 ${form.multiple === m ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}>
                      {m ? "Varias" : "Solo una"}
                    </button>
                  ))}
                </div>
                {form.multiple && (
                  <label className="flex items-center gap-2 text-sm">
                    hasta
                    <input type="number" min={2} max={form.options.length || 2} inputMode="numeric" value={form.maxSelect} onChange={(e) => setForm({ ...form, maxSelect: e.target.value })} className="w-16 rounded-xl border border-[var(--p-line)] bg-transparent px-2 py-1.5 text-center outline-none focus:border-[var(--p-brand)]" aria-label="Máximo que puede elegir" />
                  </label>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--p-line)] px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Obligatorio</span>
                <span className="mt-0.5 block text-xs text-[var(--p-muted)]">{form.isRequired ? "Tiene que elegir antes de añadirlo al pedido (como el pan)." : "Puede añadirlo sin elegir nada (como los extras)."}</span>
              </span>
              <Switch checked={form.isRequired} onChange={(v) => setForm({ ...form, isRequired: v })} label="Obligatorio" />
            </div>

            {/* Opciones */}
            <div>
              <p className="text-sm font-medium">Opciones</p>
              <p className="mt-0.5 text-xs text-[var(--p-muted)]">El precio es lo que se suma al producto (déjalo vacío si no cambia). Apaga «Disponible» si se ha acabado.</p>
              <ul className="mt-2 space-y-2">
                {form.options.map((o, i) => (
                  // Móvil: nombre a lo ancho (con la ✕) y debajo precio y «Disponible»; ordenador: todo en una fila.
                  <li key={o.key} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--p-line)] p-2">
                    <span className="order-0 flex shrink-0 flex-col">
                      <button type="button" onClick={() => moveOpt(i, -1)} disabled={i === 0} aria-label={`Subir ${o.name || "opción"}`} className="h-5 w-6 text-xs text-[var(--p-muted)] disabled:opacity-25">▲</button>
                      <button type="button" onClick={() => moveOpt(i, 1)} disabled={i === form.options.length - 1} aria-label={`Bajar ${o.name || "opción"}`} className="h-5 w-6 text-xs text-[var(--p-muted)] disabled:opacity-25">▼</button>
                    </span>
                    <input value={o.name} onChange={(e) => setOpt(o.key, { name: e.target.value })} placeholder="Nombre" aria-label="Nombre de la opción" className={`order-1 min-w-0 flex-1 basis-40 ${input} py-2`} />
                    <button type="button" onClick={() => setForm({ ...form, options: form.options.filter((x) => x.key !== o.key) })} aria-label={`Quitar ${o.name || "opción"}`} className="order-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-[var(--p-muted)] hover:bg-black/[0.05] sm:order-4">
                      ×
                    </button>
                    <span className="order-3 ml-auto flex items-center gap-3 sm:ml-0">
                      <span className="relative w-24 shrink-0">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--p-muted)]">+</span>
                        <input value={o.price} onChange={(e) => setOpt(o.key, { price: e.target.value.replace(/[^\d,.-]/g, "") })} inputMode="decimal" placeholder="0,00" aria-label={`Precio de ${o.name || "la opción"}`} className={`${input} py-2 pl-5 pr-6 text-right`} />
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--p-muted)]">€</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-[var(--p-muted)]">
                        <span className="sm:hidden">Disponible</span>
                        <Switch checked={o.isAvailable} onChange={(v) => setOpt(o.key, { isAvailable: v })} label={`${o.name || "Opción"} disponible`} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setForm({ ...form, options: [...form.options, { name: "", priceDeltaCents: 0, isAvailable: true, price: "", key: newKey() }] })} className="mt-2 text-sm font-semibold text-[var(--p-brand)]">
                + Añadir opción
              </button>
            </div>

            {/* Productos */}
            <div>
              <p className="text-sm font-medium">¿En qué productos sale?</p>
              <p className="mt-0.5 text-xs text-[var(--p-muted)]">{form.productIds.size ? `${form.productIds.size} marcados: ${[...form.productIds].slice(0, 3).map((id) => productName.get(id)).filter(Boolean).join(", ")}${form.productIds.size > 3 ? "…" : ""}` : "Marca los productos en los que el cliente verá este grupo."}</p>
              <div className="mt-2 divide-y divide-[var(--p-line)] rounded-2xl border border-[var(--p-line)]">
                {data.categories.map((c) => {
                  const ids = c.products.map((p) => p.id);
                  const on = ids.filter((id) => form.productIds.has(id)).length;
                  return (
                    <details key={c.id} open={on > 0 && on < ids.length} className="group/cat">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={on === ids.length}
                          ref={(el) => {
                            if (el) el.indeterminate = on > 0 && on < ids.length;
                          }}
                          onChange={(e) => toggleProducts(ids, e.target.checked)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Todos los de ${c.name}`}
                          className="h-4 w-4 shrink-0 accent-[var(--p-brand)]"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-[var(--p-muted)]">
                          {on}/{ids.length}
                        </span>
                        <span aria-hidden className="text-[var(--p-muted)] transition-transform group-open/cat:rotate-90">›</span>
                      </summary>
                      <ul className="grid gap-x-3 px-3 pb-3 sm:grid-cols-2">
                        {c.products.map((p) => (
                          <li key={p.id}>
                            <label className="flex min-w-0 items-center gap-2 py-1 text-sm">
                              <input type="checkbox" checked={form.productIds.has(p.id)} onChange={(e) => toggleProducts([p.id], e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--p-brand)]" />
                              <span className="truncate">{p.name}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })}
              </div>
            </div>
            {error && <p className="text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
