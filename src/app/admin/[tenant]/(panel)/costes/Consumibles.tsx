"use client";

import { ask } from "@/app/lib/dialog";
import { useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { appliesTo, consumableQty, type OrderKind } from "@/app/lib/consumables";
import { ActionForm, type Action } from "./Inventario";
import { UNIT_LABEL, euros, formatQty, type BaseUnit, type Ingredient, type Overview } from "./types";

// Consumibles: lo que se gasta y hay que reponer pero no es comida (packaging,
// limpieza, servilletas, papel, bobinas de la impresora…). Precio, stock y
// mínimo como un ingrediente; y lo que se gasta solo con cada pedido: por
// pedido (la bolsa) o por cada producto de unas categorías (caja y envoltorio
// por mollete), según el tipo de pedido. Ver docs/MODULO-COSTES.md

const CATEGORIES = ["Packaging", "Limpieza", "Papel y servilletas", "Impresora", "Otros"] as const;
const KINDS: { key: OrderKind; label: string }[] = [
  { key: "DELIVERY", label: "A domicilio" },
  { key: "TAKEAWAY", label: "Para llevar" },
  { key: "HERE", label: "Comer aquí" },
];
const UNITS: { key: BaseUnit; label: string }[] = [
  { key: "UNIT", label: "unidades" },
  { key: "L", label: "litros" },
  { key: "KG", label: "kilos" },
];

type Form = {
  id: string | null;
  name: string;
  category: string;
  baseUnit: BaseUnit;
  packSize: string;
  packPrice: string;
  supplierId: string;
  minStock: string;
  stockNow: string;
  perOrder: string;
  perItem: string;
  perItemCategoryIds: string[];
  channels: OrderKind[];
};

const input = "w-full min-w-0 rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";
const num = (v: string) => Number(v.replace(",", "."));
const str = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export default function Consumibles({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const list = data.ingredients.filter((i) => i.kind === "CONSUMABLE");
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));

  // Lo que cuesta en consumibles un pedido típico de cada tipo (1 producto de cada categoría marcada).
  const perOrderCost = (kind: OrderKind) =>
    list.reduce((a, i) => {
      const units = new Map(i.perItemCategoryIds.map((id) => [id, 1]));
      return a + consumableQty({ ...i, perItemCategoryIds: i.perItemCategoryIds.slice(0, 1) }, kind, units) * unitCostCents(i);
    }, 0);

  function open(i: Ingredient | null) {
    setError("");
    setAction(null);
    requestAnimationFrame(() => document.getElementById("costes-form")?.scrollIntoView({ block: "start" }));
    setForm(
      i
        ? {
            id: i.id,
            name: i.name,
            category: i.category ?? "Otros",
            baseUnit: i.baseUnit,
            packSize: str(i.packSize),
            packPrice: (i.packPriceCents / 100).toFixed(2).replace(".", ","),
            supplierId: i.supplierId ?? "",
            minStock: str(i.minStock),
            stockNow: "",
            perOrder: str(i.perOrderQty),
            perItem: str(i.perItemQty),
            perItemCategoryIds: i.perItemCategoryIds,
            channels: (i.perOrderChannels as OrderKind[]) ?? [],
          }
        : { id: null, name: "", category: "Packaging", baseUnit: "UNIT", packSize: "1", packPrice: "", supplierId: "", minStock: "", stockNow: "", perOrder: "", perItem: "", perItemCategoryIds: [], channels: ["DELIVERY", "TAKEAWAY"] }
    );
  }

  async function call(url: string, method: string, body: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
    return json;
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const perItem = form.perItem.trim() && form.perItemCategoryIds.length ? num(form.perItem) : null;
      const body = {
        name: form.name,
        baseUnit: form.baseUnit,
        packSize: num(form.packSize),
        packPriceCents: Math.round(num(form.packPrice) * 100),
        wastePct: 0,
        allergens: [],
        supplierId: form.supplierId || null,
        kind: "CONSUMABLE",
        category: form.category,
        perOrderQty: form.perOrder.trim() ? num(form.perOrder) : null,
        perItemQty: perItem,
        perItemCategoryIds: perItem ? form.perItemCategoryIds : [],
        // Todos marcados = todos los pedidos.
        perOrderChannels: form.channels.length === KINDS.length ? [] : form.channels,
      };
      const json = await call(form.id ? `${api}/ingredients/${form.id}` : `${api}/ingredients`, form.id ? "PATCH" : "POST", body);
      const id = form.id ?? json.ingredient?.id;
      if (id) {
        const min = form.minStock.trim() ? num(form.minStock) : null;
        await call(`${api}/stock/${id}`, "PATCH", { minStock: min });
        if (form.stockNow.trim()) await call(`${api}/stock`, "POST", { ingredientId: id, type: "COUNT", quantity: num(form.stockNow), note: "Alta del consumible" });
      }
      await onSaved();
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!form?.id) return;
    if (!(await ask(`¿Borrar el consumible «${form.name}»? Se pierde su historial de stock.`))) return;
    const res = await fetch(`${api}/ingredients/${form.id}`, { method: "DELETE" });
    if (!res.ok) return setError("No se pudo borrar");
    await onSaved();
    setForm(null);
  }

  const set = (p: Partial<Form>) => form && setForm({ ...form, ...p });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const unitWord = (u: BaseUnit) => UNITS.find((x) => x.key === u)?.label ?? UNIT_LABEL[u];

  return (
    <div className="space-y-4">
      {!form && (
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[17px] font-semibold">Consumibles</h2>
            <p className="text-sm text-[var(--p-muted)]">
              Lo que se gasta y hay que reponer aunque no sea comida: cajas, envoltorios, bolsas, servilletas, limpieza, papel, bobinas de la impresora… Ponles un mínimo y te avisa cuando toque comprar. Lo que va con cada pedido se descuenta solo.
            </p>
          </div>
          <button onClick={() => open(null)} className="p-press shrink-0 self-start rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white sm:self-auto">
            + Nuevo consumible
          </button>
        </div>
      )}

      {!form && list.some((i) => (i.perOrderQty ?? 0) > 0 || (i.perItemQty ?? 0) > 0) && (
        <div className="grid gap-2 sm:grid-cols-3">
          {KINDS.map((k) => (
            <div key={k.key} className="rounded-2xl bg-[var(--p-surface)] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="text-xs text-[var(--p-muted)]">Pedido {k.label.toLowerCase()} con 1 producto</p>
              <p className="text-lg font-semibold tabular-nums">{euros(perOrderCost(k.key))}</p>
              <p className="text-[11px] text-[var(--p-muted)]">en consumibles</p>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div id="costes-form" className="scroll-mt-24 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
          <h2 className="text-[17px] font-semibold">{form.id ? form.name || "Consumible" : "Nuevo consumible"}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={label}>Nombre</span>
              <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Caja de mollete, Bolsa de papel, Servilletas, Bobina de ticket…" className={input} />
            </label>
            <div className="sm:col-span-2">
              <span className={label}>Tipo</span>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" aria-pressed={form.category === c} onClick={() => set({ category: c })} className={`rounded-full px-3.5 py-2 text-sm font-semibold ${form.category === c ? "bg-[var(--p-ink)] text-white" : "bg-black/[0.05]"}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Se compra en paquetes de</span>
              <div className="flex gap-2">
                <input inputMode="decimal" value={form.packSize} onChange={(e) => set({ packSize: e.target.value })} className={`${input} w-24`} />
                <select value={form.baseUnit} onChange={(e) => set({ baseUnit: e.target.value as BaseUnit })} className="rounded-lg border border-[var(--p-line)] px-2 py-2 text-sm">
                  {UNITS.map((u) => (
                    <option key={u.key} value={u.key}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="block">
              <span className={label}>Precio del paquete (sin IVA)</span>
              <span className="flex items-center gap-1">
                <input inputMode="decimal" value={form.packPrice} onChange={(e) => set({ packPrice: e.target.value })} placeholder="0,00" className={input} />
                <span className="text-sm text-[var(--p-muted)]">€</span>
              </span>
            </label>
            <label className="block">
              <span className={label}>Proveedor</span>
              <select value={form.supplierId} onChange={(e) => set({ supplierId: e.target.value })} className={input}>
                <option value="">Sin proveedor</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Avisar cuando queden menos de ({unitWord(form.baseUnit)})</span>
              <input inputMode="decimal" value={form.minStock} onChange={(e) => set({ minStock: e.target.value })} placeholder="Ej. 50" className={input} />
            </label>
            <label className="block">
              <span className={label}>{form.id ? "Recuento: hay ahora" : "Hay ahora"} ({unitWord(form.baseUnit)}, opcional)</span>
              <input inputMode="decimal" value={form.stockNow} onChange={(e) => set({ stockNow: e.target.value })} placeholder="Déjalo vacío si no lo sabes" className={input} />
            </label>
          </div>

          <div className="mt-5 rounded-xl bg-black/[0.03] p-3">
            <p className="text-sm font-semibold">Se gasta solo con cada pedido</p>
            <p className="text-xs text-[var(--p-muted)]">Déjalo vacío si se gasta poco a poco (limpieza, papel…): para eso está «He gastado».</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={label}>Por pedido (la bolsa)</span>
                <input inputMode="decimal" value={form.perOrder} onChange={(e) => set({ perOrder: e.target.value })} placeholder="Ej. 1" className={input} />
              </label>
              <label className="block">
                <span className={label}>Por cada producto de… (caja, envoltorio)</span>
                <input inputMode="decimal" value={form.perItem} onChange={(e) => set({ perItem: e.target.value })} placeholder="Ej. 1" className={input} />
              </label>
            </div>
            {form.perItem.trim() !== "" && (
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Categorías">
                {data.categories.map((c) => (
                  <button key={c.id} type="button" aria-pressed={form.perItemCategoryIds.includes(c.id)} onClick={() => set({ perItemCategoryIds: toggle(form.perItemCategoryIds, c.id) })} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${form.perItemCategoryIds.includes(c.id) ? "bg-[var(--p-brand)] text-white" : "bg-[var(--p-surface)] ring-1 ring-[var(--p-line)]"}`}>
                    {form.perItemCategoryIds.includes(c.id) ? "✓ " : ""}
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {(form.perOrder.trim() !== "" || form.perItem.trim() !== "") && (
              <div className="mt-3">
                <span className={label}>En pedidos…</span>
                <div className="flex flex-wrap gap-2">
                  {KINDS.map((k) => (
                    <button key={k.key} type="button" aria-pressed={form.channels.includes(k.key)} onClick={() => set({ channels: toggle(form.channels, k.key) })} className={`rounded-full px-3.5 py-2 text-sm font-semibold ${form.channels.includes(k.key) ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)] ring-1 ring-[var(--p-line)]"}`}>
                      {form.channels.includes(k.key) ? "✓ " : ""}
                      {k.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[var(--p-muted)]">En las mesas, lo que se marca «Para llevar» cuenta como para llevar.</p>
              </div>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-full px-4 py-2 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]">Cancelar</button>
            {form.id && (
              <button onClick={remove} className="ml-auto rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">Borrar consumible</button>
            )}
          </div>
        </div>
      )}

      {!form && list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center text-sm text-[var(--p-muted)]">
          Aún no hay consumibles. Empieza por el packaging: la caja y el envoltorio del mollete, el papel de las patatas y la bolsa.
        </p>
      )}

      {!form &&
        CATEGORIES.filter((c) => list.some((i) => (i.category ?? "Otros") === c)).map((c) => (
          <section key={c} className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h3 className="px-4 pt-3 text-sm font-bold">{c}</h3>
            <ul className="divide-y divide-[var(--p-line)]">
              {list
                .filter((i) => (i.category ?? "Otros") === c)
                .map((i) => {
                  const low = i.trackStock && i.minStock != null && i.stockQty <= i.minStock;
                  const rules = [
                    (i.perOrderQty ?? 0) > 0 && `${formatQty(i.perOrderQty!, i.baseUnit)} por pedido`,
                    (i.perItemQty ?? 0) > 0 && `${formatQty(i.perItemQty!, i.baseUnit)} por cada ${i.perItemCategoryIds.map((id) => catName.get(id)).filter(Boolean).join(", ").toLowerCase()}`,
                  ].filter(Boolean);
                  const kinds = KINDS.filter((k) => appliesTo(i.perOrderChannels, k.key)).map((k) => k.label.toLowerCase());
                  const isOpen = action?.ingredient.id === i.id;
                  return (
                    <li key={i.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <button type="button" onClick={() => open(i)} className="min-w-0 flex-1 text-left">
                          <p className="font-semibold">{i.name}</p>
                          <p className="text-xs text-[var(--p-muted)]">
                            {formatQty(i.packSize, i.baseUnit)} a {euros(i.packPriceCents)}
                            {i.supplierId && ` · ${supplierName.get(i.supplierId) ?? ""}`}
                          </p>
                          {rules.length > 0 && <p className="text-xs text-[var(--p-brand)]">Se gasta solo: {rules.join(" + ")} ({kinds.join(", ")})</p>}
                        </button>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${!i.trackStock ? "bg-[var(--p-bg)] text-[var(--p-muted)]" : low ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {i.trackStock ? `${formatQty(i.stockQty, i.baseUnit)}${low ? " · reponer" : ""}` : "Sin contar"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(["USE", "RECEIPT", "COUNT"] as const).map((t) => (
                          <button key={t} onClick={() => setAction(isOpen && action?.type === t ? null : { ingredient: i, type: t })} className="rounded-lg border border-[var(--p-line)] px-2.5 py-1 text-xs font-semibold hover:bg-[var(--p-bg)]">
                            {t === "USE" ? "He gastado" : t === "RECEIPT" ? "Entrada" : "Recuento"}
                          </button>
                        ))}
                      </div>
                      {isOpen && action && (
                        <ActionForm
                          action={action}
                          api={api}
                          onCancel={() => setAction(null)}
                          onDone={async () => {
                            setAction(null);
                            await onSaved();
                          }}
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
