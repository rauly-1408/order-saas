"use client";

import { useCallback, useEffect, useState } from "react";
import { readPanelCache, writePanelCache } from "../panelCache";

// Combos / menús a precio cerrado: el dueño define los pasos ("Elige tu mollete",
// "Elige tu bebida"…), qué productos entran en cada uno y si alguno lleva suplemento.

type Item = { productId: string; extraCents: number };
type Slot = { name: string; required?: boolean; items: Item[] };
type Combo = { id: string; name: string; description: string | null; basePriceCents: number; isAvailable: boolean; comboSlots: (Slot & { id: string })[] };
type Catalog = { id: string; name: string; products: { id: string; name: string; basePriceCents: number; isActive: boolean }[] }[];
type Data = { combos: Combo[]; categories: Catalog };
type Form = { id: string | null; name: string; description: string; price: string; isAvailable: boolean; slots: { name: string; required: boolean; items: { productId: string; extra: string }[] }[] };

const card = "rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]";
const input = "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const labelCls = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";
const eur = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const toCents = (v: string) => Math.round(Number((v || "0").replace(",", ".")) * 100);
const toText = (c: number) => (c ? String(c / 100).replace(".", ",") : "");

// Propuesta en un clic: mollete/burger + bebida + postre, con las categorías adivinadas por el nombre.
function suggested(categories: Catalog): Form {
  const pick = (re: RegExp) => categories.filter((c) => re.test(c.name)).flatMap((c) => c.products.filter((p) => p.isActive).map((p) => ({ productId: p.id, extra: "" })));
  return {
    id: null,
    name: "Menú mollete",
    description: "Tu mollete, una bebida y un postre",
    price: "12,50",
    isAvailable: true,
    slots: [
      { name: "Elige tu mollete", required: true, items: pick(/mollete|bocadillo|burger|burguer/i) },
      { name: "Elige tu bebida", required: true, items: pick(/bebida|refresco/i) },
      { name: "Elige tu postre", required: true, items: pick(/postre|dulce/i) },
    ].filter((s) => s.items.length),
  };
}

export default function Combos({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/combos`;
  const cacheKey = `combos:${tenant}`;
  const [data, setData] = useState<Data | null>(() => readPanelCache<Data>(cacheKey) ?? null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los menús");
      setData(json);
      writePanelCache(cacheKey, json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los menús");
    }
  }, [api, cacheKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(form.id ? `${api}/${form.id}` : api, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          priceCents: toCents(form.price),
          isAvailable: form.isAvailable,
          slots: form.slots.map((s) => ({ name: s.name, required: s.required, items: s.items.map((i) => ({ productId: i.productId, extraCents: toCents(i.extra) })) })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar el menú");
      await reload();
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el menú");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: Combo) {
    const res = await fetch(`${api}/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isAvailable: !c.isAvailable }) });
    if (res.ok) await reload();
  }

  async function remove(c: Combo) {
    if (!confirm(`¿Borrar el menú «${c.name}»? Los pedidos ya hechos no cambian.`)) return;
    const res = await fetch(`${api}/${c.id}`, { method: "DELETE" });
    if (res.ok) await reload();
  }

  if (!data) return error ? <p className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p> : <p className="py-16 text-center text-[var(--p-muted)]">Cargando…</p>;

  if (form) return <ComboForm form={form} onChange={setForm} categories={data.categories} error={error} saving={saving} onSave={save} onCancel={() => { setForm(null); setError(""); }} />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--p-muted)]">
        Menús a precio cerrado: el cliente elige un producto en cada paso. Salen en la carta dentro de «Menús» y el stock se descuenta de lo que elige.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => { setError(""); setForm({ id: null, name: "", description: "", price: "", isAvailable: true, slots: [{ name: "", required: true, items: [] }] }); }} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
          + Nuevo menú
        </button>
        {data.combos.length === 0 && (
          <button onClick={() => { setError(""); setForm(suggested(data.categories)); }} className="p-press rounded-full border border-[var(--p-line)] px-4 py-2 text-sm font-medium hover:bg-black/[0.04]">
            Empezar con «Mollete + bebida + postre»
          </button>
        )}
      </div>
      {data.combos.length === 0 ? (
        <p className={`${card} p-10 text-center text-sm text-[var(--p-muted)]`}>Aún no tienes menús.</p>
      ) : (
        <ul className={`${card} divide-y divide-[var(--p-line)] overflow-hidden`}>
          {data.combos.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {c.name} <span className="font-normal text-[var(--p-muted)]">· {eur(c.basePriceCents)}</span>
                </p>
                <p className="text-xs text-[var(--p-muted)]">{c.comboSlots.map((s) => `${s.name} (${s.items.length})`).join(" · ")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.04] text-[var(--p-faint)]"}`}>{c.isAvailable ? "En la carta" : "Agotado"}</span>
                <button
                  onClick={() => { setError(""); setForm({ id: c.id, name: c.name, description: c.description ?? "", price: toText(c.basePriceCents), isAvailable: c.isAvailable, slots: c.comboSlots.map((s) => ({ name: s.name, required: s.required !== false, items: s.items.map((i) => ({ productId: i.productId, extra: toText(i.extraCents) })) })) }); }}
                  className="p-press rounded-full px-3 py-1 text-xs font-medium text-[var(--p-muted)] hover:bg-black/[0.04]"
                >
                  Editar
                </button>
                <button onClick={() => toggle(c)} className="p-press rounded-full px-3 py-1 text-xs font-medium text-[var(--p-brand)] hover:bg-black/[0.04]">
                  {c.isAvailable ? "Agotar" : "Volver a la carta"}
                </button>
                <button onClick={() => remove(c)} className="p-press rounded-full px-3 py-1 text-xs font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComboForm({ form, onChange, categories, error, saving, onSave, onCancel }: { form: Form; onChange: (f: Form) => void; categories: Catalog; error: string; saving: boolean; onSave: () => void; onCancel: () => void }) {
  const setSlot = (i: number, slot: Form["slots"][number]) => onChange({ ...form, slots: form.slots.map((s, j) => (j === i ? slot : s)) });
  const [openCat, setOpenCat] = useState<string | null>(null); // "paso:categoría" desplegada
  const products = categories.flatMap((c) => c.products);
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? "Producto borrado";

  return (
    <div className={`${card} p-4 sm:p-6`}>
      <h3 className="mb-4 text-[17px] font-semibold">{form.id ? "Editar menú" : "Nuevo menú"}</h3>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <div>
          <label className={labelCls} htmlFor="combo-name">Nombre</label>
          <input id="combo-name" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Menú mollete" maxLength={80} className={input} />
        </div>
        <div>
          <label className={labelCls} htmlFor="combo-price">Precio del menú (€)</label>
          <input id="combo-price" value={form.price} onChange={(e) => onChange({ ...form, price: e.target.value })} inputMode="decimal" placeholder="12,50" className={input} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="combo-desc">Descripción (opcional)</label>
          <input id="combo-desc" value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} maxLength={300} placeholder="Tu mollete, una bebida y un postre" className={input} />
        </div>
      </div>

      <p className="mt-5 text-[13px] font-medium text-[var(--p-muted)]">Pasos del menú</p>
      <p className="mb-3 text-xs text-[var(--p-muted)]">En cada paso el cliente elige un producto. El pan y los extras de cada producto se eligen igual que en la carta (los extras se cobran aparte).</p>
      <div className="space-y-3">
        {form.slots.map((slot, i) => (
          <div key={i} className="rounded-xl border border-[var(--p-line)] p-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--p-muted)]">{i + 1}.</span>
              <input value={slot.name} onChange={(e) => setSlot(i, { ...slot, name: e.target.value })} placeholder="Elige tu bebida" maxLength={60} className={`${input} min-w-0`} aria-label={`Nombre del paso ${i + 1}`} />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--p-muted)]" title="El cliente puede no elegir nada en este paso (p. ej. «Complementos»)">
                <input type="checkbox" checked={!slot.required} onChange={(e) => setSlot(i, { ...slot, required: !e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
                Opcional
              </label>
              {form.slots.length > 1 && (
                <button type="button" onClick={() => onChange({ ...form, slots: form.slots.filter((_, j) => j !== i) })} className="p-press shrink-0 rounded-full px-3 py-1.5 text-xs text-[var(--p-muted)] hover:bg-black/[0.04]">
                  Quitar
                </button>
              )}
            </div>

            {/* Productos elegidos en este paso, con su suplemento */}
            {slot.items.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {slot.items.map((it, k) => (
                  <li key={it.productId} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{nameOf(it.productId)}</span>
                    <span className="shrink-0 text-xs text-[var(--p-muted)]">+</span>
                    <input
                      value={it.extra}
                      onChange={(e) => setSlot(i, { ...slot, items: slot.items.map((x, m) => (m === k ? { ...x, extra: e.target.value } : x)) })}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Suplemento de ${nameOf(it.productId)}`}
                      className="w-16 shrink-0 rounded-lg px-2 py-1 text-right text-sm outline-none"
                    />
                    <span className="shrink-0 text-xs text-[var(--p-muted)]">€</span>
                    <button type="button" onClick={() => setSlot(i, { ...slot, items: slot.items.filter((_, m) => m !== k) })} aria-label={`Quitar ${nameOf(it.productId)}`} className="p-press shrink-0 rounded-full px-2 text-[var(--p-muted)] hover:bg-black/[0.04]">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Añadir productos por categoría */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {categories.map((c) => {
                const key = `${i}:${c.id}`;
                const inSlot = c.products.filter((p) => slot.items.some((it) => it.productId === p.id)).length;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setOpenCat(openCat === key ? null : key)}
                    aria-expanded={openCat === key}
                    className={`p-press rounded-full px-3 py-1 text-xs font-medium ${openCat === key ? "bg-[var(--p-brand)] text-white" : inSlot ? "bg-[var(--p-brand-soft)] text-[var(--p-brand)]" : "bg-black/[0.05] text-[var(--p-muted)]"}`}
                  >
                    {c.name}
                    {inSlot > 0 && ` · ${inSlot}`}
                  </button>
                );
              })}
            </div>
            {categories.map((c) => {
              if (openCat !== `${i}:${c.id}`) return null;
              const allIn = c.products.every((p) => slot.items.some((it) => it.productId === p.id));
              return (
                <div key={c.id} className="mt-2 rounded-lg bg-black/[0.03] p-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSlot(i, {
                        ...slot,
                        items: allIn
                          ? slot.items.filter((it) => !c.products.some((p) => p.id === it.productId))
                          : [...slot.items, ...c.products.filter((p) => !slot.items.some((it) => it.productId === p.id)).map((p) => ({ productId: p.id, extra: "" }))],
                      })
                    }
                    className="mb-1 text-xs font-semibold text-[var(--p-brand)]"
                  >
                    {allIn ? "Quitar toda la categoría" : "Añadir toda la categoría"}
                  </button>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {c.products.map((p) => {
                      const on = slot.items.some((it) => it.productId === p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setSlot(i, { ...slot, items: on ? slot.items.filter((it) => it.productId !== p.id) : [...slot.items, { productId: p.id, extra: "" }] })}
                            className="h-4 w-4 accent-[var(--p-brand)]"
                          />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="shrink-0 text-xs text-[var(--p-muted)]">{eur(p.basePriceCents)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {form.slots.length < 6 && (
          <button type="button" onClick={() => onChange({ ...form, slots: [...form.slots, { name: "", required: true, items: [] }] })} className="p-press rounded-full px-3 py-1.5 text-sm font-medium text-[var(--p-brand)] hover:bg-black/[0.04]">
            + Añadir paso
          </button>
        )}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isAvailable} onChange={(e) => onChange({ ...form, isAvailable: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
        Mostrar en la carta
      </label>
      {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={onSave} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Guardando…" : form.id ? "Guardar cambios" : "Crear menú"}
        </button>
        <button onClick={onCancel} className="p-press rounded-full px-4 py-2 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.04]">
          Cancelar
        </button>
      </div>
    </div>
  );
}
