"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ImagePicker from "../archivos/ImagePicker";
import { readPanelCache, writePanelCache } from "../panelCache";

// Carta → Productos: lista por categorías con tarjetas que se tocan para
// editar (en el móvil también, sin tabla que se salga de la pantalla). Cada
// tarjeta deja a mano lo del día a día: «En la carta» (se ve o no en la
// tienda) y «Agotado» (se ve pero no se puede pedir). La edición se abre en una
// hoja encima, esté donde esté el producto.

type Product = {
  id: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  imageUrl: string | null;
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: number;
};
type Category = { id: string; name: string; products: Product[] };
type FormData = { name: string; description: string; price: string; imageUrl: string; isActive: boolean; isAvailable: boolean; isFeatured: boolean; categoryId: string };

const fmt = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const toEuros = (c: number) => fmt.format(c / 100);
// «12,50» o «12.5» → 1250 céntimos; null si no es un precio válido.
function parsePrice(v: string): number | null {
  const s = v.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}
const priceText = (c: number) => (c / 100).toFixed(2).replace(".", ",");

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-[var(--p-brand)]" : "bg-black/15"}`}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-5" : "left-1"}`} />
    </button>
  );
}

export default function CartaClient({ tenant }: { tenant: string; embedded?: boolean }) {
  const cacheKey = `carta:${tenant}`;
  const [categories, setCategories] = useState<Category[]>(() => readPanelCache<Category[]>(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => readPanelCache(cacheKey) === undefined);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ product: Product | null; form: FormData } | null>(null); // product null = nuevo
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // producto con un cambio rápido en curso
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortal((document.querySelector(".panel") as HTMLElement | null) ?? document.body);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/${tenant}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setCategories(data.categories ?? []);
      writePanelCache(cacheKey, data.categories ?? []);
    } catch {
      setMsg({ ok: false, text: "No se pudo cargar la carta. Revisa la conexión." });
    } finally {
      setLoading(false);
    }
  }, [tenant, cacheKey]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    if (ok) setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 3000);
  };

  function openEdit(p: Product, categoryId: string) {
    setFormError("");
    setEditing({ product: p, form: { name: p.name, description: p.description ?? "", price: priceText(p.basePriceCents), imageUrl: p.imageUrl ?? "", isActive: p.isActive, isAvailable: p.isAvailable, isFeatured: p.isFeatured, categoryId } });
  }
  function openNew(categoryId: string) {
    setFormError("");
    setEditing({ product: null, form: { name: "", description: "", price: "", imageUrl: "", isActive: true, isAvailable: true, isFeatured: false, categoryId } });
  }

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const cents = parsePrice(f.price);
    if (!f.name.trim()) return setFormError("Ponle un nombre al producto.");
    if (cents == null) return setFormError("Escribe el precio en euros, por ejemplo 12,50.");
    setSaving(true);
    setFormError("");
    try {
      const payload = { name: f.name.trim(), description: f.description, basePriceCents: cents, imageUrl: f.imageUrl, isActive: f.isActive, isAvailable: f.isAvailable, isFeatured: f.isFeatured, categoryId: f.categoryId };
      const url = editing.product ? `/api/admin/${tenant}/products/${editing.product.id}` : `/api/admin/${tenant}/products`;
      const res = await fetch(url, { method: editing.product ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "No se pudo guardar");
      }
      flash(true, editing.product ? `«${payload.name}» guardado` : `«${payload.name}» añadido a la carta`);
      setEditing(null);
      fetchData();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const p = editing?.product;
    if (!p || !confirm(`¿Eliminar «${p.name}» de la carta? No se puede deshacer.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/${tenant}/products/${p.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      flash(true, `«${p.name}» eliminado`);
      setEditing(null);
      fetchData();
    } catch {
      setFormError("No se pudo eliminar");
    } finally {
      setSaving(false);
    }
  }

  // Cambio rápido desde la tarjeta (en la carta / agotado), con respuesta al momento.
  async function quick(p: Product, patch: Partial<Pick<Product, "isActive" | "isAvailable">>) {
    setBusy(p.id);
    setCategories((cs) => cs.map((c) => ({ ...c, products: c.products.map((x) => (x.id === p.id ? { ...x, ...patch } : x)) })));
    try {
      const res = await fetch(`/api/admin/${tenant}/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error();
      if (patch.isAvailable !== undefined) flash(true, patch.isAvailable ? `«${p.name}» vuelve a estar disponible` : `«${p.name}» marcado como agotado`);
      if (patch.isActive !== undefined) flash(true, patch.isActive ? `«${p.name}» ya se ve en la tienda` : `«${p.name}» oculto en la tienda`);
    } catch {
      flash(false, "No se pudo guardar el cambio");
    } finally {
      setBusy(null);
      fetchData();
    }
  }

  async function renameCategory() {
    if (!renaming) return;
    const name = renaming.name.trim();
    const current = categories.find((c) => c.id === renaming.id)?.name;
    setRenaming(null);
    if (!name || name === current) return;
    const res = await fetch(`/api/admin/${tenant}/categories/${renaming.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    if (!res.ok) return flash(false, "No se pudo cambiar el nombre de la categoría");
    flash(true, `Categoría renombrada a «${name}»`);
    fetchData();
  }

  const q = search.trim().toLowerCase();
  const groups = q
    ? [{ id: "search", name: `Resultados para «${search.trim()}»`, products: categories.flatMap((c) => c.products.filter((p) => p.name.toLowerCase().includes(q)).map((p) => ({ ...p, _cat: c }))) }]
    : categories.map((c) => ({ id: c.id, name: c.name, products: c.products.map((p) => ({ ...p, _cat: c })) }));
  const total = categories.reduce((a, c) => a + c.products.length, 0);
  const soldOut = categories.reduce((a, c) => a + c.products.filter((p) => !p.isAvailable).length, 0);

  const f = editing?.form;
  const setF = (patch: Partial<FormData>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });
  const input = "mt-1 w-full rounded-xl border border-[var(--p-line)] bg-transparent px-3 py-2.5 text-[15px] outline-none focus:border-[var(--p-brand)]";

  return (
    <div>
      {/* Barra: buscar y añadir, siempre arriba */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className="min-w-0 flex-1 rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]" />
        <button type="button" onClick={() => categories[0] && openNew(categories[0].id)} disabled={!categories.length} className="p-press shrink-0 rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          + Añadir producto
        </button>
      </div>
      <p className="mt-2 text-xs text-[var(--p-muted)]">
        {total} productos{soldOut > 0 && ` · ${soldOut} agotados`} · toca un producto para editarlo
      </p>

      {msg && (
        <p className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-[var(--p-accent-soft)] text-[var(--p-accent)]"}`} role="status">
          {msg.text}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-[var(--p-muted)]">Cargando la carta…</p>
      ) : (
        <div className="mt-4 space-y-6">
          {groups.map((g) => (
            <section key={g.id} aria-label={g.name}>
              <div className="mb-2 flex items-center gap-2">
                {renaming?.id === g.id ? (
                  <input
                    autoFocus
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: g.id, name: e.target.value })}
                    onBlur={renameCategory}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameCategory();
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    aria-label="Nuevo nombre de la categoría"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--p-brand)] px-3 py-1.5 text-[15px] font-semibold"
                  />
                ) : (
                  <h2 className="min-w-0 truncate text-[15px] font-semibold">
                    {g.name} <span className="font-normal text-[var(--p-muted)]">· {g.products.length}</span>
                  </h2>
                )}
                {!q && renaming?.id !== g.id && (
                  <>
                    <button type="button" onClick={() => setRenaming({ id: g.id, name: g.name })} className="shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-xs text-[var(--p-muted)] hover:bg-black/[0.05] hover:text-[var(--p-ink)]" title="Cambiar el nombre de la categoría" aria-label={`Renombrar ${g.name}`}>
                      ✎<span className="hidden sm:inline"> Renombrar</span>
                    </button>
                    <button type="button" onClick={() => openNew(g.id)} className="ml-auto shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold text-[var(--p-brand)] hover:bg-[var(--p-brand-soft)]" aria-label={`Añadir producto en ${g.name}`}>
                      + Añadir
                    </button>
                  </>
                )}
              </div>
              {/* Móvil y tablet: filas que se tocan. Ordenador: rejilla de tarjetas por categoría. */}
              {g.products.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-[var(--p-line)] px-4 py-6 text-center text-sm text-[var(--p-muted)]">{q ? "No hay productos con ese nombre." : "Todavía no hay productos en esta categoría."}</p>
              ) : (
                <ul className="overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:grid lg:grid-cols-3 lg:gap-3 lg:overflow-visible lg:rounded-none lg:bg-transparent lg:shadow-none xl:grid-cols-4">
                  {g.products.map((p, i) => (
                    <li key={p.id} className={`lg:overflow-hidden lg:rounded-2xl lg:border-0 lg:bg-[var(--p-surface)] lg:shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${i ? "border-t border-[var(--p-line)]" : ""}`}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openEdit(p, p._cat.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openEdit(p, p._cat.id);
                          }
                        }}
                        className={`p-lift flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors hover:bg-black/[0.025] sm:px-4 lg:h-full lg:flex-col lg:items-stretch lg:gap-0 lg:p-0 ${p.isActive ? "" : "opacity-60"}`}
                        aria-label={`Editar ${p.name}`}
                      >
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover lg:h-28 lg:w-full lg:rounded-none" />
                        ) : (
                          <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--p-brand-soft)] text-lg font-semibold text-[var(--p-brand)] lg:h-28 lg:w-full lg:rounded-none lg:text-3xl">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1 lg:px-3 lg:pt-2.5">
                          <p className="flex items-center gap-1.5 truncate text-[15px] font-medium">
                            <span className="truncate">{p.name}</span>
                            {p.isFeatured && <span className="shrink-0 text-xs text-amber-600" title="Destacado">★</span>}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--p-muted)]">
                            <span className="font-semibold tabular-nums text-[var(--p-ink)]">{toEuros(p.basePriceCents)}</span>
                            {q && <span>· {p._cat.name}</span>}
                            {!p.isAvailable && <span className="rounded-full bg-[var(--p-accent-soft)] px-2 py-0.5 font-semibold text-[var(--p-accent)]">Agotado</span>}
                            {!p.isActive && <span className="rounded-full bg-black/[0.06] px-2 py-0.5 font-semibold">Oculto en la tienda</span>}
                            {!p.imageUrl && p.isActive && <span className="hidden sm:inline">· sin foto</span>}
                          </p>
                        </div>
                        {/* Acciones rápidas: no abren la edición */}
                        <div className="flex shrink-0 items-center gap-3 lg:mt-2 lg:justify-between lg:border-t lg:border-[var(--p-line)] lg:px-3 lg:py-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            disabled={busy === p.id}
                            onClick={() => quick(p, { isAvailable: !p.isAvailable })}
                            className={`hidden whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold sm:block ${p.isAvailable ? "bg-black/[0.05] text-[var(--p-muted)] hover:text-[var(--p-ink)]" : "bg-[var(--p-accent)] text-white"}`}
                            title={p.isAvailable ? "Marcar como agotado: se sigue viendo pero no se puede pedir" : "Volver a ponerlo a la venta"}
                          >
                            {p.isAvailable ? "Marcar agotado" : "Agotado · reponer"}
                          </button>
                          <div className="flex flex-col items-center gap-0.5">
                            <Switch checked={p.isActive} onChange={(v) => quick(p, { isActive: v })} label={`${p.name}: ${p.isActive ? "se ve en la tienda" : "oculto en la tienda"}`} />
                            <span className="text-[10px] text-[var(--p-muted)]">En carta</span>
                          </div>
                          <span aria-hidden className="text-lg text-[var(--p-faint)] lg:hidden">›</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {!q && categories.length === 0 && <p className="py-10 text-center text-sm text-[var(--p-muted)]">Tu carta está vacía.</p>}
        </div>
      )}

      {/* Hoja de edición: encima de todo, esté donde esté el producto */}
      {portal &&
        editing &&
        f &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={editing.product ? `Editar ${editing.product.name}` : "Nuevo producto"}>
            <button type="button" aria-label="Cerrar" onClick={() => !saving && setEditing(null)} className="absolute inset-0 bg-black/40" />
            <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] bg-[var(--p-surface)] text-[var(--p-ink)] sm:max-w-lg sm:rounded-[24px]">
              <div className="flex items-center justify-between border-b border-[var(--p-line)] px-5 py-4">
                <h2 className="truncate text-lg font-semibold">{editing.product ? editing.product.name : "Nuevo producto"}</h2>
                <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-full px-3 py-1 text-sm text-[var(--p-muted)] hover:bg-black/[0.05]">
                  Cerrar
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                <label className="block text-sm font-medium">
                  Nombre
                  <input value={f.name} onChange={(e) => setF({ name: e.target.value })} placeholder="Por ejemplo: Mollete de jamón" className={input} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    Precio
                    <div className="relative">
                      <input value={f.price} onChange={(e) => setF({ price: e.target.value.replace(/[^\d,.]/g, "") })} inputMode="decimal" placeholder="12,50" className={`${input} pr-8 text-right tabular-nums`} />
                      <span className="pointer-events-none absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-[var(--p-muted)]">€</span>
                    </div>
                  </label>
                  <label className="block text-sm font-medium">
                    Categoría
                    <select value={f.categoryId} onChange={(e) => setF({ categoryId: e.target.value })} className={input}>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-sm font-medium">
                  Descripción
                  <textarea rows={2} value={f.description} onChange={(e) => setF({ description: e.target.value })} placeholder="Qué lleva, en una frase" className={`${input} resize-y`} />
                </label>
                <div className="text-sm font-medium">
                  Foto
                  <div className="mt-1">
                    <ImagePicker tenant={tenant} value={f.imageUrl} onChange={(url) => setF({ imageUrl: url })} />
                  </div>
                </div>
                <div className="divide-y divide-[var(--p-line)] rounded-2xl border border-[var(--p-line)]">
                  {(
                    [
                      ["isActive", "En la carta", "Se ve en la tienda. Apágalo para esconderlo sin borrarlo.", false],
                      ["isAvailable", "Agotado", "Se sigue viendo, pero no se puede pedir hasta que lo repongas.", true],
                      ["isFeatured", "Destacado", "Sale primero y con una estrella en la tienda.", false],
                    ] as const
                  ).map(([key, label, hint, inverted]) => (
                    <label key={key} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                      <span>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--p-muted)]">{hint}</span>
                      </span>
                      <Switch checked={inverted ? !f[key] : f[key]} onChange={(v) => setF({ [key]: inverted ? !v : v } as Partial<FormData>)} label={label} />
                    </label>
                  ))}
                </div>
                {formError && (
                  <p className="text-sm text-[var(--p-accent)]" role="alert">
                    {formError}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-[var(--p-line)] px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
                {editing.product && (
                  <button type="button" onClick={remove} disabled={saving} className="rounded-full px-3 py-2.5 text-sm font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)] disabled:opacity-50">
                    Eliminar
                  </button>
                )}
                <button type="button" onClick={() => setEditing(null)} disabled={saving} className="ml-auto rounded-full border border-[var(--p-line)] px-4 py-2.5 text-sm font-medium disabled:opacity-50">
                  Cancelar
                </button>
                <button type="button" onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? "Guardando…" : editing.product ? "Guardar" : "Añadir"}
                </button>
              </div>
            </div>
          </div>,
          portal
        )}
    </div>
  );
}
