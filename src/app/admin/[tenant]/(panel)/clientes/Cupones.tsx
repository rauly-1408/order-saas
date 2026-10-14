"use client";

import { useState } from "react";
import { couponLabel } from "@/app/lib/retention";
import { card, euros, ghostBtn, input, label, primaryBtn, type CouponRow, type Overview } from "./types";

type Form = { code: string; type: "PERCENT" | "FIXED"; value: string; minOrder: string; maxRedemptions: string; expiresAt: string; oncePerCustomer: boolean };
const EMPTY: Form = { code: "", type: "PERCENT", value: "10", minOrder: "", maxRedemptions: "", expiresAt: "", oncePerCustomer: true };

const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

// Crea un cupón y devuelve su id (lo usa también el formulario de campañas).
export async function createCoupon(api: string, form: Form): Promise<string> {
  const res = await fetch(`${api}/coupons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: form.code,
      type: form.type,
      value: form.type === "PERCENT" ? Number(form.value) : toCents(form.value),
      minOrderCents: form.minOrder ? toCents(form.minOrder) : 0,
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      expiresAt: form.expiresAt || null,
      oncePerCustomer: form.oncePerCustomer,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "No se pudo crear el cupón");
  return json.coupon.id as string;
}

function status(c: CouponRow): { text: string; cls: string } {
  if (!c.active) return { text: "Desactivado", cls: "bg-black/[0.04] text-[var(--p-faint)]" };
  if (c.expiresAt && new Date(c.expiresAt) < new Date()) return { text: "Caducado", cls: "bg-black/[0.04] text-[var(--p-faint)]" };
  if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) return { text: "Agotado", cls: "bg-black/[0.04] text-[var(--p-faint)]" };
  return { text: "Activo", cls: "bg-emerald-50 text-emerald-700" };
}

export default function Cupones({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      await createCoupon(api, form);
      await onSaved();
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cupón");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: CouponRow) {
    const res = await fetch(`${api}/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    if (res.ok) await onSaved();
  }

  return (
    <div className="space-y-4">
      {!form && (
        <button onClick={() => { setError(""); setForm(EMPTY); }} className={primaryBtn}>
          + Nuevo cupón
        </button>
      )}

      {form && (
        <div className={`${card} p-4 sm:p-6`}>
          <h3 className="mb-4 text-[17px] font-semibold">Nuevo cupón</h3>
          <CouponFields form={form} onChange={setForm} />
          {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className={primaryBtn}>
              {saving ? "Guardando…" : "Crear cupón"}
            </button>
            <button onClick={() => setForm(null)} className={ghostBtn}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {data.coupons.length === 0 ? (
        !form && (
          <p className={`${card} p-10 text-center text-sm text-[var(--p-muted)]`}>
            Aún no tienes cupones. Crea uno aquí o directamente al preparar una campaña.
          </p>
        )
      ) : (
        <ul className={`${card} divide-y divide-[var(--p-line)] overflow-hidden`}>
          {data.coupons.map((c) => {
            const st = status(c);
            return (
              <li key={c.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold tracking-wide">
                    {c.code} <span className="font-normal text-[var(--p-muted)]">· {couponLabel(c)}</span>
                  </p>
                  <p className="text-xs text-[var(--p-muted)]">
                    {[
                      c.minOrderCents ? `Mínimo ${euros(c.minOrderCents)}` : "Sin pedido mínimo",
                      c.oncePerCustomer ? "un uso por cliente" : "usos ilimitados por cliente",
                      c.expiresAt ? `hasta el ${new Date(c.expiresAt).toLocaleDateString("es-ES")}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--p-muted)] tabular-nums">
                    {c.redeemedCount}
                    {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""} usos
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
                  <button onClick={() => toggle(c)} className="p-press rounded-full px-3 py-1 text-xs font-medium text-[var(--p-brand)] hover:bg-black/[0.04]">
                    {c.active ? "Desactivar" : "Activar"}
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

export function CouponFields({ form, onChange }: { form: Form; onChange: (f: Form) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={label}>Código</label>
        <input value={form.code} onChange={(e) => onChange({ ...form, code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="VUELVE15" className={input} />
      </div>
      <div>
        <label className={label}>Descuento</label>
        <div className="flex gap-2">
          <input value={form.value} onChange={(e) => onChange({ ...form, value: e.target.value })} inputMode="decimal" className={`${input} min-w-0`} />
          <div className="flex shrink-0 gap-1 rounded-full bg-black/[0.05] p-1">
            {(["PERCENT", "FIXED"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onChange({ ...form, type: t })}
                className={`rounded-full px-3 py-1 text-sm font-medium ${form.type === t ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}
              >
                {t === "PERCENT" ? "%" : "€"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div>
        <label className={label}>Pedido mínimo (€, opcional)</label>
        <input value={form.minOrder} onChange={(e) => onChange({ ...form, minOrder: e.target.value })} inputMode="decimal" placeholder="0" className={input} />
      </div>
      <div>
        <label className={label}>Usos totales (opcional)</label>
        <input value={form.maxRedemptions} onChange={(e) => onChange({ ...form, maxRedemptions: e.target.value })} inputMode="numeric" placeholder="Sin límite" className={input} />
      </div>
      <div>
        <label className={label}>Válido hasta (opcional)</label>
        <input type="date" value={form.expiresAt} onChange={(e) => onChange({ ...form, expiresAt: e.target.value })} className={input} />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" checked={form.oncePerCustomer} onChange={(e) => onChange({ ...form, oncePerCustomer: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
        Un solo uso por cliente
      </label>
    </div>
  );
}

export type { Form as CouponForm };
export { EMPTY as EMPTY_COUPON };
