"use client";

import { useState } from "react";
import { DAY_SHORT, deliveryDateText, deliverySummary, nextDeliveryOffset } from "@/app/lib/purchasing";
import type { Overview, Supplier, SupplierOrderMethod } from "./types";

type Form = {
  id: string | null;
  name: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  email: string;
  extraEmails: string[];
  notes: string;
  orderMethod: SupplierOrderMethod;
  deliveryDays: number[];
  leadDays: string;
  orderCutoff: string;
  minOrder: string;
};
const EMPTY: Form = {
  id: null, name: "", contactName: "", phone: "", whatsapp: "", email: "", extraEmails: [], notes: "",
  orderMethod: "WHATSAPP", deliveryDays: [], leadDays: "1", orderCutoff: "", minOrder: "",
};

const METHODS: { key: SupplierOrderMethod; label: string }[] = [
  { key: "WHATSAPP", label: "WhatsApp" },
  { key: "EMAIL", label: "Email" },
  { key: "PHONE", label: "Teléfono" },
  { key: "IN_PERSON", label: "En persona" },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.key, m.label])) as Record<SupplierOrderMethod, string>;

const input = "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";
const section = "mt-6 mb-3 text-[15px] font-semibold first:mt-0";
const euros = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

// Próxima entrega si se pidiera ahora (hora del dispositivo).
export function nextDeliveryText(s: { deliveryDays: number[]; leadDays: number; orderCutoff: string | null }): string | null {
  const now = new Date();
  const offset = nextDeliveryOffset(((now.getDay() + 6) % 7) + 1, now.getHours() * 60 + now.getMinutes(), s);
  if (offset == null) return null;
  if (offset === 0) return "hoy";
  if (offset === 1) return "mañana";
  return deliveryDateText(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

export default function Proveedores({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ingredientCount = (id: string) => data.ingredients.filter((i) => i.supplierId === id).length;

  function edit(s: Supplier) {
    requestAnimationFrame(() => document.getElementById("costes-form")?.scrollIntoView({ block: "start" }));
    setError("");
    setForm({
      id: s.id,
      name: s.name,
      contactName: s.contactName ?? "",
      phone: s.phone ?? "",
      whatsapp: s.whatsapp ?? "",
      email: s.email ?? "",
      extraEmails: s.extraEmails ?? [],
      notes: s.notes ?? "",
      orderMethod: s.orderMethod ?? "WHATSAPP",
      deliveryDays: s.deliveryDays ?? [],
      leadDays: String(s.leadDays ?? 1),
      orderCutoff: s.orderCutoff ?? "",
      minOrder: s.minOrderCents != null ? (s.minOrderCents / 100).toFixed(2).replace(".", ",") : "",
    });
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(form.id ? `${api}/suppliers/${form.id}` : `${api}/suppliers`, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          leadDays: Number(form.leadDays),
          orderCutoff: form.orderCutoff || null,
          minOrderCents: form.minOrder.trim() ? Math.round(Number(form.minOrder.replace(",", ".")) * 100) : null,
        }),
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
    if (res.ok) {
      await onSaved();
      setForm(null);
    } else setError("No se pudo borrar");
  }

  const schedule = form ? { deliveryDays: form.deliveryDays, leadDays: Number(form.leadDays) || 0, orderCutoff: form.orderCutoff || null } : null;
  const preview = schedule ? nextDeliveryText(schedule) : null;

  return (
    <div className="space-y-4">
      {!form && (
        <button onClick={() => { setError(""); setForm(EMPTY); }} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
          + Nuevo proveedor
        </button>
      )}

      {form && (
        <div id="costes-form" className="scroll-mt-4 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_12px_32px_-14px_rgba(0,0,0,0.22)] sm:p-6">
          <h3 className="mb-5 text-[17px] font-semibold">{form.id ? "Editar proveedor" : "Nuevo proveedor"}</h3>

          <p className={section}>Datos</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Nombre *</span>
              <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Panadería, carnicería…" />
            </div>
            <div>
              <span className={label}>Persona de contacto</span>
              <input className={input} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="Fernando" />
            </div>
          </div>

          <p className={section}>Contacto</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Teléfono</span>
              <input className={input} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="600 000 000" />
            </div>
            <div>
              <span className={label}>WhatsApp</span>
              <input className={input} type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder={form.phone ? "Igual que el teléfono" : "600 000 000"} />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Email</span>
              <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="pedidos@proveedor.com" />
              {form.extraEmails.map((em, i) => (
                <div key={i} className="mt-2 flex gap-2">
                  <input
                    className={input}
                    type="email"
                    value={em}
                    placeholder="Otro email (copia)"
                    onChange={(e) => setForm({ ...form, extraEmails: form.extraEmails.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                  <button
                    type="button"
                    aria-label="Quitar email"
                    onClick={() => setForm({ ...form, extraEmails: form.extraEmails.filter((_, j) => j !== i) })}
                    className="shrink-0 rounded-full px-3 text-[var(--p-muted)] hover:bg-black/[0.04]"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {form.extraEmails.length < 5 && (
                <button type="button" onClick={() => setForm({ ...form, extraEmails: [...form.extraEmails, ""] })} className="mt-2 text-sm font-medium text-[var(--p-brand)]">
                  + Añadir email en copia
                </button>
              )}
            </div>
          </div>

          <p className={section}>Pedidos</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Cómo le haces los pedidos</span>
              <div className="flex flex-wrap gap-1 rounded-2xl bg-black/[0.05] p-1 sm:w-fit sm:rounded-full">
                {METHODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setForm({ ...form, orderMethod: m.key })}
                    className={`p-press rounded-full px-3 py-1.5 text-sm font-medium ${
                      form.orderMethod === m.key ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Pedido mínimo (€)</span>
              <input className={input} inputMode="decimal" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: e.target.value })} placeholder="Sin mínimo" />
            </div>
          </div>

          <p className={section}>Reparto</p>
          <span className={label}>Días que entrega</span>
          <div className="flex flex-wrap gap-2">
            {DAY_SHORT.map((d, i) => {
              const day = i + 1;
              const on = form.deliveryDays.includes(day);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setForm({ ...form, deliveryDays: on ? form.deliveryDays.filter((x) => x !== day) : [...form.deliveryDays, day].sort() })}
                  className={`p-press h-10 w-10 rounded-full text-sm font-semibold ${on ? "bg-[var(--p-brand)] text-white" : "bg-black/[0.05] text-[var(--p-muted)]"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <span className={label}>Hay que pedir</span>
              <select className={input} value={form.leadDays} onChange={(e) => setForm({ ...form, leadDays: e.target.value })}>
                <option value="0">El mismo día de la entrega</option>
                <option value="1">1 día antes</option>
                <option value="2">2 días antes</option>
                <option value="3">3 días antes</option>
                <option value="7">1 semana antes</option>
              </select>
            </div>
            <div>
              <span className={label}>Hasta las (opcional)</span>
              <input className={input} type="time" value={form.orderCutoff} onChange={(e) => setForm({ ...form, orderCutoff: e.target.value })} />
            </div>
          </div>
          {form.deliveryDays.length > 0 && (
            <p className="mt-3 rounded-xl bg-[var(--p-brand-soft)] px-4 py-3 text-sm text-[var(--p-brand)]">
              Si le pides ahora, te entrega <span className="font-semibold">{preview ?? "—"}</span>.
            </p>
          )}

          <p className={section}>Notas</p>
          <textarea className={`${input} min-h-20`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Condiciones de pago, forma de entrega…" />

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-full px-4 py-2 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]">Cancelar</button>
            {form.id && (
              <button
                onClick={() => {
                  const it = data.suppliers.find((x) => x.id === form.id);
                  if (it) remove(it);
                }}
                className="ml-auto whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Borrar proveedor
              </button>
            )}
          </div>
        </div>
      )}

      {form ? null : data.suppliers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center text-sm text-[var(--p-muted)]">
          Añade a quién le compras para tener sus datos a mano y hacerle pedidos desde Compras.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--p-line)] rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {data.suppliers.map((s) => {
            const summary = deliverySummary(s);
            const next = nextDeliveryText(s);
            return (
              <li key={s.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => edit(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      edit(s);
                    }
                  }}
                  aria-label={`Editar ${s.name}`}
                  className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-black/[0.025]"
                >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium text-[var(--p-muted)]">{METHOD_LABEL[s.orderMethod]}</span>
                  </div>
                  <div className="text-xs text-[var(--p-muted)]">
                    {[s.contactName, s.whatsapp || s.phone, s.email].filter(Boolean).join(" · ") || "Sin datos de contacto"} · {ingredientCount(s.id)} ingredientes
                  </div>
                  {(summary || s.minOrderCents != null) && (
                    <div className="text-xs text-[var(--p-faint)]">
                      {[summary, next && `próxima: ${next}`, s.minOrderCents != null && `mínimo ${euros(s.minOrderCents)}`].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <span aria-hidden className="shrink-0 text-lg text-[var(--p-faint)]">›</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
