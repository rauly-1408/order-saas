"use client";

import { ask } from "@/app/lib/dialog";
import { useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { ALLERGENS, UNIT_LABEL, euros, type BaseUnit, type Ingredient, type Overview } from "./types";
import AllergenIcon from "./AllergenIcon";

type Form = {
  id: string | null;
  name: string;
  baseUnit: BaseUnit;
  packSize: string;
  packPrice: string; // en euros, como lo escribe el usuario
  wastePct: string;
  supplierId: string;
  allergens: string[];
};

const EMPTY: Form = { id: null, name: "", baseUnit: "G", packSize: "", packPrice: "", wastePct: "0", supplierId: "", allergens: [] };

const input = "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";

export default function Ingredientes({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));

  function edit(i: Ingredient) {
    requestAnimationFrame(() => document.getElementById("costes-form")?.scrollIntoView({ block: "start" }));
    setError("");
    setForm({
      id: i.id,
      name: i.name,
      baseUnit: i.baseUnit,
      packSize: String(i.packSize),
      packPrice: (i.packPriceCents / 100).toFixed(2).replace(".", ","),
      wastePct: String(i.wastePct),
      supplierId: i.supplierId ?? "",
      allergens: i.allergens,
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    const priceCents = Math.round(Number(form.packPrice.replace(",", ".")) * 100);
    const body = {
      name: form.name,
      baseUnit: form.baseUnit,
      packSize: Number(form.packSize.replace(",", ".")),
      packPriceCents: priceCents,
      wastePct: Number(form.wastePct.replace(",", ".")) || 0,
      supplierId: form.supplierId || null,
      allergens: form.allergens,
    };
    try {
      const res = await fetch(form.id ? `${api}/ingredients/${form.id}` : `${api}/ingredients`, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      await onSaved();
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(i: Ingredient) {
    if (!(await ask(`¿Borrar "${i.name}"? Se quitará de todos los escandallos.`))) return;
    const res = await fetch(`${api}/ingredients/${i.id}`, { method: "DELETE" });
    if (res.ok) {
      await onSaved();
      setForm(null);
    } else setError("No se pudo borrar");
  }

  const unit = form ? UNIT_LABEL[form.baseUnit] : "";

  return (
    <div className="space-y-4">
      {!form && (
        <button onClick={() => { setError(""); setForm(EMPTY); }} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
          + Nuevo ingrediente
        </button>
      )}

      {form && (
        <div id="costes-form" className="scroll-mt-4 rounded-2xl bg-[var(--p-surface)] shadow-[0_12px_32px_-14px_rgba(0,0,0,0.22)] p-4 sm:p-6">
          <h3 className="mb-4 font-bold">{form.id ? "Editar ingrediente" : "Nuevo ingrediente"}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={label}>Nombre</span>
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pollo, mollete de cúrcuma…" />
            </div>
            <div>
              <span className={label}>Unidad de medida</span>
              <select className={input} value={form.baseUnit} onChange={(e) => setForm({ ...form, baseUnit: e.target.value as BaseUnit })}>
                <option value="G">Gramos (g)</option>
                <option value="KG">Kilos (kg)</option>
                <option value="ML">Mililitros (ml)</option>
                <option value="L">Litros (l)</option>
                <option value="UNIT">Unidades (ud)</option>
              </select>
            </div>
            <div>
              <span className={label}>Proveedor</span>
              <select className={input} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">— Sin proveedor —</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <span className={label}>Formato de compra ({unit})</span>
              <input className={input} inputMode="decimal" value={form.packSize} onChange={(e) => setForm({ ...form, packSize: e.target.value })} placeholder={form.baseUnit === "G" ? "1000 (una bolsa de 1 kg)" : "Cantidad que compras"} />
            </div>
            <div>
              <span className={label}>Precio del formato (€)</span>
              <input className={input} inputMode="decimal" value={form.packPrice} onChange={(e) => setForm({ ...form, packPrice: e.target.value })} placeholder="12,50" />
            </div>
            <div>
              <span className={label}>Merma (%)</span>
              <input className={input} inputMode="decimal" value={form.wastePct} onChange={(e) => setForm({ ...form, wastePct: e.target.value })} placeholder="0" />
              <span className="mt-1 block text-[11px] text-[var(--p-muted)]">Lo que se pierde al limpiar o preparar. Encarece el coste útil.</span>
            </div>
            <div className="flex items-end">
              <PreviewCost form={form} />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Alérgenos</span>
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((a) => {
                  const on = form.allergens.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setForm({ ...form, allergens: on ? form.allergens.filter((x) => x !== a) : [...form.allergens, a] })}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs transition-colors ${on ? "border-[var(--p-brand)] bg-[var(--p-brand)] font-semibold text-white" : "border-[var(--p-line)] text-[var(--p-muted)] hover:border-[var(--p-brand)]"}`}
                    >
                      <AllergenIcon name={a} size={20} className={on ? "ring-2 ring-white/70" : ""} />
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-full px-4 py-2 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]">Cancelar</button>
            {form.id && (
              <button
                onClick={() => {
                  const it = data.ingredients.find((x) => x.id === form.id);
                  if (it) remove(it);
                }}
                className="ml-auto whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Borrar ingrediente
              </button>
            )}
          </div>
        </div>
      )}

      {form ? null : data.ingredients.filter((i) => !i.isPrep).length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center text-sm text-[var(--p-muted)]">
          Añade los ingredientes que compras con su precio para calcular el coste de tus platos.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--p-line)] rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {data.ingredients.filter((i) => !i.isPrep).map((i) => (
            <li key={i.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => edit(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      edit(i);
                    }
                  }}
                  aria-label={`Editar ${i.name}`}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-black/[0.025]"
                >
              <div className="min-w-0">
                <div className="font-semibold">{i.name}</div>
                <div className="text-xs text-[var(--p-muted)]">
                  {i.packSize} {UNIT_LABEL[i.baseUnit]} a {euros(i.packPriceCents)}
                  {i.wastePct > 0 && ` · merma ${i.wastePct} %`}
                  {i.supplierId && ` · ${supplierName.get(i.supplierId) ?? ""}`}
                </div>
                {i.allergens.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1" aria-label={`Alérgenos: ${i.allergens.join(", ")}`}>
                    {i.allergens.map((a) => (
                      <span key={a} title={a}>
                        <AllergenIcon name={a} size={20} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold">{costPerUnit(i)}</span>
                <span aria-hidden className="text-lg text-[var(--p-faint)]">›</span>
              </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Coste por unidad legible: en g/ml se muestra por kg/l, que es como se piensa en cocina.
function costPerUnit(i: Pick<Ingredient, "baseUnit" | "packSize" | "packPriceCents" | "wastePct">): string {
  const c = unitCostCents(i);
  if (i.baseUnit === "G") return `${euros(c * 1000)}/kg`;
  if (i.baseUnit === "ML") return `${euros(c * 1000)}/l`;
  return `${euros(c)}/${UNIT_LABEL[i.baseUnit]}`;
}

function PreviewCost({ form }: { form: Form }) {
  const packSize = Number(form.packSize.replace(",", "."));
  const packPriceCents = Math.round(Number(form.packPrice.replace(",", ".")) * 100);
  const wastePct = Number(form.wastePct.replace(",", ".")) || 0;
  if (!(packSize > 0) || !(packPriceCents >= 0)) return null;
  return (
    <div className="w-full rounded-lg bg-[var(--p-bg)] px-3 py-2 text-sm">
      Coste útil: <span className="font-bold">{costPerUnit({ baseUnit: form.baseUnit, packSize, packPriceCents, wastePct })}</span>
    </div>
  );
}
