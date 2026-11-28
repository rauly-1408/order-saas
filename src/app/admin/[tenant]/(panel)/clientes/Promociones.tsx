"use client";

import { useState } from "react";
import { promotionConditions, promotionLabel, WEEKDAY_SHORT, type PromotionRule } from "@/app/lib/promotions";
import { card, euros, ghostBtn, input, label, primaryBtn, type Overview, type PromotionRow } from "./types";

// Promociones automáticas: se aplican solas en el checkout, sin código, y se
// anuncian en la carta. No se acumulan entre sí ni con un cupón: gana la que más ahorra.

type Form = {
  id: string | null;
  name: string;
  kind: PromotionRow["kind"];
  value: string;
  minOrder: string;
  weekdays: number[];
  allDay: boolean;
  startTime: string;
  endTime: string;
  channel: "" | "DELIVERY" | "TAKEAWAY";
  firstOrderOnly: boolean;
  startsAt: string;
  endsAt: string;
  productIds: string[];
};

const EMPTY: Form = { id: null, name: "", kind: "ORDER_PERCENT", value: "10", minOrder: "", weekdays: [], allDay: true, startTime: "20:00", endTime: "23:00", channel: "", firstOrderOnly: false, startsAt: "", endsAt: "", productIds: [] };

// Ideas de partida en un clic.
const IDEAS: { title: string; form: Partial<Form> }[] = [
  { title: "Bienvenida: 10 % en el primer pedido", form: { name: "Bienvenida", kind: "ORDER_PERCENT", value: "10", firstOrderOnly: true } },
  { title: "Envío gratis desde 25 €", form: { name: "Envío gratis", kind: "FREE_DELIVERY", minOrder: "25", channel: "DELIVERY" } },
  { title: "Martes −15 % para recoger", form: { name: "Martes de recogida", kind: "ORDER_PERCENT", value: "15", weekdays: [2], channel: "TAKEAWAY" } },
];

const KINDS: { key: PromotionRow["kind"]; label: string }[] = [
  { key: "ORDER_PERCENT", label: "% de descuento" },
  { key: "ORDER_FIXED", label: "€ de descuento" },
  { key: "FREE_DELIVERY", label: "Envío gratis" },
  { key: "SECOND_UNIT_PERCENT", label: "Descuento en segunda unidad" },
];

const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

function toForm(p: PromotionRow): Form {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    value: p.kind === "ORDER_FIXED" ? String(p.value / 100).replace(".", ",") : String(p.value),
    minOrder: p.minOrderCents ? String(p.minOrderCents / 100).replace(".", ",") : "",
    weekdays: p.weekdays,
    allDay: !p.startTime,
    startTime: p.startTime ?? "20:00",
    endTime: p.endTime ?? "23:00",
    channel: p.channel ?? "",
    firstOrderOnly: p.firstOrderOnly,
    startsAt: dateInput(p.startsAt),
    endsAt: dateInput(p.endsAt),
    productIds: p.productIds ?? [],
  };
}

function status(p: PromotionRow): { text: string; cls: string } {
  if (!p.active) return { text: "Pausada", cls: "bg-black/[0.04] text-[var(--p-faint)]" };
  if (p.endsAt && new Date(p.endsAt) < new Date()) return { text: "Terminada", cls: "bg-black/[0.04] text-[var(--p-faint)]" };
  if (p.startsAt && new Date(p.startsAt) > new Date()) return { text: "Programada", cls: "bg-sky-50 text-sky-700" };
  return { text: "Activa", cls: "bg-emerald-50 text-emerald-700" };
}

export default function Promociones({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(form.id ? `${api}/promotions/${form.id}` : `${api}/promotions`, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          kind: form.kind,
          value: form.kind === "ORDER_PERCENT" || form.kind === "SECOND_UNIT_PERCENT" ? Number(form.value) : form.kind === "ORDER_FIXED" ? toCents(form.value) : 0,
          productIds: form.productIds,
          minOrderCents: form.minOrder ? toCents(form.minOrder) : 0,
          weekdays: form.weekdays,
          startTime: form.allDay ? null : form.startTime,
          endTime: form.allDay ? null : form.endTime,
          channel: form.channel || null,
          firstOrderOnly: form.firstOrderOnly,
          startsAt: form.startsAt || null,
          endsAt: form.endsAt || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar la promoción");
      await onSaved();
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la promoción");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: PromotionRow) {
    const res = await fetch(`${api}/promotions/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) });
    if (res.ok) await onSaved();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--p-muted)]">
        Se aplican solas al pedir, sin código, y se anuncian en tu carta. No se acumulan: si hay varias o el cliente mete un cupón, se aplica la que más ahorra.
      </p>

      {!form && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setError(""); setForm(EMPTY); }} className={primaryBtn}>
            + Nueva promoción
          </button>
          {data.promotions.length === 0 &&
            IDEAS.map((idea) => (
              <button key={idea.title} onClick={() => { setError(""); setForm({ ...EMPTY, ...idea.form }); }} className="p-press rounded-full border border-[var(--p-line)] px-3 py-1.5 text-xs font-medium hover:bg-black/[0.04]">
                {idea.title}
              </button>
            ))}
        </div>
      )}

      {form && (
        <div className={`${card} p-4 sm:p-6`}>
          <h3 className="mb-4 text-[17px] font-semibold">{form.id ? "Editar promoción" : "Nueva promoción"}</h3>
          <PromotionFields form={form} products={data.products} categories={data.categories} onChange={setForm} />
          {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className={primaryBtn}>
              {saving ? "Guardando…" : form.id ? "Guardar cambios" : "Crear promoción"}
            </button>
            <button onClick={() => setForm(null)} className={ghostBtn}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {data.promotions.length === 0
        ? !form && <p className={`${card} p-10 text-center text-sm text-[var(--p-muted)]`}>Aún no tienes promociones. Empieza con una de las ideas de arriba.</p>
        : (
          <ul className={`${card} divide-y divide-[var(--p-line)] overflow-hidden`}>
            {data.promotions.map((p) => {
              const st = status(p);
              const cond = promotionConditions(p as PromotionRule);
              return (
                <li key={p.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {p.name}
                      {p.name.toLowerCase() !== promotionLabel(p).toLowerCase() && <span className="font-normal text-[var(--p-muted)]"> · {promotionLabel(p)}</span>}
                    </p>
                    <p className="text-xs text-[var(--p-muted)]">{cond || "Siempre"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[var(--p-muted)] tabular-nums">
                      {p.uses} {p.uses === 1 ? "uso" : "usos"}
                      {p.discountCents > 0 && ` · ${euros(p.discountCents)}`}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
                    <button onClick={() => { setError(""); setForm(toForm(p)); }} className="p-press rounded-full px-3 py-1 text-xs font-medium text-[var(--p-muted)] hover:bg-black/[0.04]">
                      Editar
                    </button>
                    <button onClick={() => toggle(p)} className="p-press rounded-full px-3 py-1 text-xs font-medium text-[var(--p-brand)] hover:bg-black/[0.04]">
                      {p.active ? "Pausar" : "Activar"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}

function PromotionFields({ form, products, categories, onChange }: { form: Form; products: Overview["products"]; categories: Overview["categories"]; onChange: (f: Form) => void }) {
  const toggleDay = (d: number) => onChange({ ...form, weekdays: form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d] });
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const availableCategories = categories.filter((category) => products.some((product) => product.categoryId === category.id && product.active));
  const selectedCategory = availableCategories.find((category) => category.id === activeCategoryId) ?? availableCategories[0] ?? null;
  const categoryProducts = selectedCategory ? products.filter((product) => product.categoryId === selectedCategory.id && product.active) : [];
  const selectedInCategory = categoryProducts.filter((product) => form.productIds.includes(product.id)).length;
  const toggleCategory = (categoryId: string, checked: boolean) => {
    const ids = products.filter((product) => product.categoryId === categoryId && product.active).map((product) => product.id);
    const nextIds = checked ? [...new Set([...form.productIds, ...ids])] : form.productIds.filter((id) => !ids.includes(id));
    onChange({ ...form, productIds: nextIds });
  };
  const toggleProduct = (productId: string, checked: boolean) => {
    onChange({ ...form, productIds: checked ? [...new Set([...form.productIds, productId])] : form.productIds.filter((id) => id !== productId) });
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={label}>Nombre (lo verán tus clientes)</label>
        <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Martes de recogida" maxLength={60} className={input} />
      </div>
      <div>
        <label className={label}>Qué se lleva el cliente</label>
        <div role="group" aria-label="Tipo de beneficio" className="grid grid-cols-2 gap-2 sm:max-w-2xl">
          {KINDS.map((k) => {
            const selected = form.kind === k.key;
            return (
              <button
                key={k.key}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ ...form, kind: k.key, value: k.key === "SECOND_UNIT_PERCENT" && form.kind !== "SECOND_UNIT_PERCENT" ? "50" : form.value })}
                className={`p-press flex min-h-12 w-full items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-brand)] focus-visible:ring-offset-2 ${selected ? "border-[var(--p-brand)] bg-[var(--p-brand)] text-white shadow-sm" : "border-[var(--p-line)] bg-[var(--p-surface)] text-[var(--p-muted)] hover:border-[var(--p-brand)] hover:text-[var(--p-brand)]"}`}
              >
                {k.label}
              </button>
            );
          })}
        </div>
      </div>
      {form.kind !== "FREE_DELIVERY" && (
        <div>
          <label className={label}>{form.kind === "ORDER_PERCENT" || form.kind === "SECOND_UNIT_PERCENT" ? "Descuento (%)" : "Descuento (€)"}</label>
          <input value={form.value} onChange={(e) => onChange({ ...form, value: e.target.value })} inputMode="decimal" className={input} />
        </div>
      )}
      {form.kind === "SECOND_UNIT_PERCENT" && (
        <div className="sm:col-span-2 rounded-xl border border-[var(--p-line)] p-3">
          <label className={label}>Productos incluidos</label>
          <p className="mb-2 text-xs text-[var(--p-muted)]">Se descuenta el porcentaje indicado en la segunda unidad y en cada pareja adicional (4.ª, 6.ª…).</p>
          <section aria-labelledby="promotion-category-selection-title" className="mb-4 rounded-xl border border-[var(--p-line)] p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 id="promotion-category-selection-title" className="text-sm font-semibold">Selección por categoría</h4>
                <p className="mt-1 text-xs text-[var(--p-muted)]">Abrí una ventana aparte para explorar las categorías y elegir sus productos.</p>
              </div>
              <button type="button" onClick={() => { setActiveCategoryId(availableCategories[0]?.id ?? null); setCategoryPickerOpen(true); }} disabled={availableCategories.length === 0} className="p-press rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2 text-sm font-semibold text-[var(--p-brand)] hover:border-[var(--p-brand)] disabled:opacity-50">
                Abrir categorías
              </button>
            </div>
          </section>
          <section aria-labelledby="promotion-product-selection-title" className="rounded-xl border border-[var(--p-line)] p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 id="promotion-product-selection-title" className="text-sm font-semibold">Selección por producto</h4>
                <p className="mt-1 text-xs text-[var(--p-muted)]">Elegí directamente cada producto de la lista.</p>
              </div>
              <span className="rounded-full bg-black/[0.04] px-2.5 py-1 text-xs font-medium text-[var(--p-muted)]">{form.productIds.length} seleccionados</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
            {products.map((product) => (
              <label key={product.id} className={`flex items-center gap-2 text-sm ${product.active ? "" : "opacity-50"}`}>
                <input type="checkbox" checked={form.productIds.includes(product.id)} disabled={!product.active} onChange={(e) => toggleProduct(product.id, e.target.checked)} className="h-4 w-4 accent-[var(--p-brand)]" />
                <span>{product.name} <span className="text-xs text-[var(--p-muted)]">· {product.categoryName}{product.active ? "" : " · no disponible"}</span></span>
              </label>
            ))}
            </div>
            {products.length === 0 && <p className="text-sm text-[var(--p-muted)]">No hay productos disponibles para seleccionar.</p>}
          </section>

          {categoryPickerOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setCategoryPickerOpen(false); }}>
              <section role="dialog" aria-modal="true" aria-labelledby="promotion-category-picker-title" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--p-line)] bg-[var(--p-surface)] shadow-2xl">
                <header className="flex items-start justify-between gap-3 border-b border-[var(--p-line)] p-4 sm:p-5">
                  <div>
                    <h3 id="promotion-category-picker-title" className="text-base font-semibold">Elegir productos por categoría</h3>
                    <p className="mt-1 text-xs text-[var(--p-muted)]">Elegí una categoría y marcá los productos que querés incluir.</p>
                  </div>
                  <button type="button" onClick={() => setCategoryPickerOpen(false)} aria-label="Cerrar selector de categorías" className="p-press rounded-full px-3 py-1 text-lg leading-none text-[var(--p-muted)] hover:bg-black/[0.05]">×</button>
                </header>
                <div className="grid min-h-0 flex-1 sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.5fr)]">
                  <nav aria-label="Categorías" className="max-h-40 space-y-1 overflow-y-auto border-b border-[var(--p-line)] p-3 sm:max-h-none sm:border-b-0 sm:border-r">
                    {availableCategories.map((category) => {
                      const items = products.filter((product) => product.categoryId === category.id && product.active);
                      if (items.length === 0) return null;
                      const count = items.filter((product) => form.productIds.includes(product.id)).length;
                      const active = selectedCategory?.id === category.id;
                      return (
                        <button key={category.id} type="button" onClick={() => setActiveCategoryId(category.id)} aria-current={active ? "true" : undefined} className={`p-press flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${active ? "bg-[var(--p-brand)] text-white" : "text-[var(--p-text)] hover:bg-black/[0.05]"}`}>
                          <span className="min-w-0 truncate">{category.name}</span>
                          <span className={`shrink-0 text-xs tabular-nums ${active ? "text-white/80" : "text-[var(--p-muted)]"}`}>{count}/{items.length}</span>
                        </button>
                      );
                    })}
                  </nav>
                  <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
                    {selectedCategory ? (
                      <>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h4 className="font-semibold">{selectedCategory.name}</h4>
                            <p className="text-xs text-[var(--p-muted)]">{categoryProducts.length} productos disponibles</p>
                          </div>
                          <button type="button" onClick={() => toggleCategory(selectedCategory.id, selectedInCategory !== categoryProducts.length)} disabled={categoryProducts.length === 0} className="p-press rounded-lg border border-[var(--p-line)] px-3 py-2 text-xs font-semibold text-[var(--p-brand)] hover:border-[var(--p-brand)] disabled:opacity-50">
                            {selectedInCategory === categoryProducts.length ? "Quitar todos" : "Seleccionar todos"}
                          </button>
                        </div>
                        <div className="space-y-2">
                          {categoryProducts.map((product) => (
                            <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--p-line)] px-3 py-3 text-sm hover:bg-black/[0.025]">
                              <input type="checkbox" checked={form.productIds.includes(product.id)} onChange={(e) => toggleProduct(product.id, e.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--p-brand)]" />
                              <span className="min-w-0 flex-1">{product.name}</span>
                              <span className="text-xs text-[var(--p-muted)]">{form.productIds.includes(product.id) ? "Incluido" : "No incluido"}</span>
                            </label>
                          ))}
                          {categoryProducts.length === 0 && <p className="text-sm text-[var(--p-muted)]">Esta categoría no tiene productos activos.</p>}
                        </div>
                      </>
                    ) : <p className="text-sm text-[var(--p-muted)]">No hay categorías con productos activos.</p>}
                  </div>
                </div>
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--p-line)] p-4 sm:px-5">
                  <span className="text-xs text-[var(--p-muted)]">{form.productIds.length} productos seleccionados en total</span>
                  <button type="button" onClick={() => setCategoryPickerOpen(false)} className={primaryBtn}>Listo</button>
                </footer>
              </section>
            </div>
          )}
        </div>
      )}
      <div>
        <label className={label}>Pedido mínimo (€, opcional)</label>
        <input value={form.minOrder} onChange={(e) => onChange({ ...form, minOrder: e.target.value })} inputMode="decimal" placeholder="0" className={input} />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Días (si no marcas ninguno, todos)</label>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAY_SHORT.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(i + 1)}
              aria-pressed={form.weekdays.includes(i + 1)}
              className={`p-press h-9 w-9 rounded-full text-sm font-semibold ${form.weekdays.includes(i + 1) ? "bg-[var(--p-brand)] text-white" : "bg-black/[0.05] text-[var(--p-muted)]"}`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.allDay} onChange={(e) => onChange({ ...form, allDay: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
          Todo el día
        </label>
        {!form.allDay && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            de <input type="time" value={form.startTime} onChange={(e) => onChange({ ...form, startTime: e.target.value })} className={`${input} w-auto`} />
            a <input type="time" value={form.endTime} onChange={(e) => onChange({ ...form, endTime: e.target.value })} className={`${input} w-auto`} />
          </div>
        )}
      </div>
      <div>
        <label className={label}>Para</label>
        <select value={form.channel} onChange={(e) => onChange({ ...form, channel: e.target.value as Form["channel"] })} className={input}>
          <option value="">Domicilio y recogida</option>
          <option value="DELIVERY">Solo a domicilio</option>
          <option value="TAKEAWAY">Solo para recoger</option>
        </select>
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => onChange({ ...form, firstOrderOnly: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
        Solo en el primer pedido del cliente
      </label>
      <div>
        <label className={label}>Desde (opcional)</label>
        <input type="date" value={form.startsAt} onChange={(e) => onChange({ ...form, startsAt: e.target.value })} className={input} />
      </div>
      <div>
        <label className={label}>Hasta (opcional)</label>
        <input type="date" value={form.endsAt} onChange={(e) => onChange({ ...form, endsAt: e.target.value })} className={input} />
      </div>
    </div>
  );
}
