"use client";

import { useState } from "react";
import type { Overview, Supplier } from "./types";

type Form = { id: string | null; name: string; contactName: string; phone: string; email: string; notes: string };
const EMPTY: Form = { id: null, name: "", contactName: "", phone: "", email: "", notes: "" };

const input = "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";

export default function Proveedores({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ingredientCount = (id: string) => data.ingredients.filter((i) => i.supplierId === id).length;

  function edit(s: Supplier) {
    setError("");
    setForm({ id: s.id, name: s.name, contactName: s.contactName ?? "", phone: s.phone ?? "", email: s.email ?? "", notes: s.notes ?? "" });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(form.id ? `${api}/suppliers/${form.id}` : `${api}/suppliers`, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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

  async function remove(s: Supplier) {
    if (!window.confirm(`¿Borrar "${s.name}"? Sus ingredientes se quedarán sin proveedor.`)) return;
    const res = await fetch(`${api}/suppliers/${s.id}`, { method: "DELETE" });
    if (res.ok) await onSaved();
  }

  return (
    <div className="space-y-4">
      {!form && (
        <button onClick={() => { setError(""); setForm(EMPTY); }} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
          + Nuevo proveedor
        </button>
      )}

      {form && (
        <div className="rounded-2xl bg-[var(--p-surface)] shadow-[0_12px_32px_-14px_rgba(0,0,0,0.22)] p-4 sm:p-6">
          <h3 className="mb-4 font-bold">{form.id ? "Editar proveedor" : "Nuevo proveedor"}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <span className={label}>Nombre</span>
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Panadería, carnicería…" />
            </div>
            <div>
              <span className={label}>Persona de contacto</span>
              <input className={input} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </div>
            <div>
              <span className={label}>Teléfono / WhatsApp</span>
              <input className={input} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Email</span>
              <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Notas</span>
              <textarea className={`${input} min-h-20`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Días de reparto, pedido mínimo…" />
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-lg px-4 py-2 text-sm text-[var(--p-muted)] hover:bg-[var(--p-bg)]">Cancelar</button>
          </div>
        </div>
      )}

      {data.suppliers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center text-sm text-[var(--p-muted)]">
          Añade a quién le compras para tener sus datos a mano y, más adelante, hacerle pedidos desde aquí.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--p-line)] rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {data.suppliers.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="min-w-0">
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-[var(--p-muted)]">
                  {[s.contactName, s.phone, s.email].filter(Boolean).join(" · ") || "Sin datos de contacto"} · {ingredientCount(s.id)} ingredientes
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => edit(s)} className="text-sm font-semibold text-[var(--p-brand)]">Editar</button>
                <button onClick={() => remove(s)} className="text-sm text-red-500">Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
