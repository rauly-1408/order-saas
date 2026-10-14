"use client";

import { useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { ALLERGENS, UNIT_LABEL, euros, type BaseUnit, type Ingredient, type Overview } from "./types";

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

const input = "w-full rounded-lg border border-[#eaeaf4] px-3 py-2 text-sm outline-none focus:border-[#7939fe]";
const label = "mb-1 block text-xs font-bold uppercase tracking-wider text-[#6b6890]";

export default function Ingredientes({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const supplierName = new Map(data.suppliers.map((s) => [s.id, s.name]));

  function edit(i: Ingredient) {
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
    if (!window.confirm(`¿Borrar "${i.name}"? Se quitará de todos los escandallos.`)) return;
    const res = await fetch(`${api}/ingredients/${i.id}`, { method: "DELETE" });
    if (res.ok) await onSaved();
  }

  const unit = form ? UNIT_LABEL[form.baseUnit] : "";

  return (
    <div className="space-y-4">
      {!form && (
        <button onClick={() => { setError(""); setForm(EMPTY); }} className="rounded-lg bg-[#7939fe] px-4 py-2 text-sm font-semibold text-white">
          + Nuevo ingrediente
        </button>
      )}

      {form && (
        <div className="rounded-xl border border-[#e0d1ff] bg-white p-4 sm:p-6">
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
              <span className="mt-1 block text-[11px] text-[#6b6890]">Lo que se pierde al limpiar o preparar. Encarece el coste útil.</span>
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
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "border-[#7939fe] bg-[#7939fe] text-white" : "border-[#eaeaf4] text-[#6b6890]"}`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button onClick={save} disabled={saving} className="rounded-lg bg-[#7939fe] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm text-[#6b6890] hover:bg-[#f7f7fb]">Cancelar</button>
          </div>
        </div>
      )}

      {data.ingredients.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#eaeaf4] bg-white p-6 text-center text-sm text-[#6b6890]">
          Añade los ingredientes que compras con su precio para calcular el coste de tus platos.
        </p>
      ) : (
        <ul className="divide-y divide-[#eaeaf4] rounded-xl border border-[#eaeaf4] bg-white">
          {data.ingredients.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold">{i.name}</div>
                <div className="text-xs text-[#6b6890]">
                  {i.packSize} {UNIT_LABEL[i.baseUnit]} a {euros(i.packPriceCents)}
                  {i.wastePct > 0 && ` · merma ${i.wastePct} %`}
                  {i.supplierId && ` · ${supplierName.get(i.supplierId) ?? ""}`}
                </div>
                {i.allergens.length > 0 && <div className="mt-0.5 text-[11px] text-amber-700">Alérgenos: {i.allergens.join(", ")}</div>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{costPerUnit(i)}</span>
                <button onClick={() => edit(i)} className="text-sm font-semibold text-[#7939fe]">Editar</button>
                <button onClick={() => remove(i)} className="text-sm text-red-500">Borrar</button>
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
    <div className="w-full rounded-lg bg-[#f7f7fb] px-3 py-2 text-sm">
      Coste útil: <span className="font-bold">{costPerUnit({ baseUnit: form.baseUnit, packSize, packPriceCents, wastePct })}</span>
    </div>
  );
}
