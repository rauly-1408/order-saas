"use client";

import { useState } from "react";
import { card, euros, ghostBtn, input, label, primaryBtn, type LoyaltyRow, type Overview } from "./types";

// Tarjeta de fidelidad: el cliente acumula un sello por pedido y en el pedido
// nº N se lleva el premio gratis (p. ej. bocadillo + bebida en el 5.º pedido).
// Se identifica por su teléfono; no necesita registrarse.

type Slot = { label: string; categoryIds: string[] };
type Form = { active: boolean; ordersRequired: string; rewardName: string; slots: Slot[]; maxReward: string };

const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

// Propuesta inicial: "bocadillo + bebida", adivinando las categorías por el nombre.
function suggested(categories: Overview["categories"]): Form {
  const match = (re: RegExp) => categories.filter((c) => re.test(c.name)).map((c) => c.id);
  return {
    active: true,
    ordersRequired: "5",
    rewardName: "Bocadillo + bebida gratis",
    slots: [
      { label: "Bocadillo", categoryIds: match(/mollete|bocadillo|burger|burguer|sandwich|bocata/i) },
      { label: "Bebida", categoryIds: match(/bebida|refresco|drink/i) },
    ],
    maxReward: "",
  };
}

function toForm(l: LoyaltyRow): Form {
  return {
    active: l.active,
    ordersRequired: String(l.ordersRequired),
    rewardName: l.rewardName,
    slots: l.rewardSlots,
    maxReward: l.maxRewardCents ? String(l.maxRewardCents / 100).replace(".", ",") : "",
  };
}

export default function Fidelizacion({ data, api, onSaved }: { data: Overview; api: string; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const loyalty = data.loyalty;

  async function save(f: Form) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${api}/loyalty`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          active: f.active,
          ordersRequired: Number(f.ordersRequired),
          rewardName: f.rewardName,
          rewardSlots: f.slots,
          maxRewardCents: f.maxReward ? toCents(f.maxReward) : null,
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

  if (form) {
    return (
      <div className={`${card} p-4 sm:p-6`}>
        <h3 className="mb-4 text-[17px] font-semibold">Tarjeta de fidelidad</h3>
        <LoyaltyFields form={form} onChange={setForm} categories={data.categories} />
        {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => save(form)} disabled={saving} className={primaryBtn}>
            {saving ? "Guardando…" : "Guardar tarjeta"}
          </button>
          <button onClick={() => setForm(null)} className={ghostBtn}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (!loyalty) {
    return (
      <div className={`${card} p-6 sm:p-8`}>
        <p className="text-lg font-semibold">Premia a los que vuelven</p>
        <p className="mt-1 max-w-xl text-sm text-[var(--p-muted)]">
          Cada pedido suma un sello con el teléfono del cliente, sin registros ni apps. Al llegar al pedido que elijas, el premio se descuenta solo en el checkout.
        </p>
        <button onClick={() => { setError(""); setForm(suggested(data.categories)); }} className={`${primaryBtn} mt-5`}>
          Crear tarjeta de fidelidad
        </button>
      </div>
    );
  }

  const n = loyalty.ordersRequired;
  return (
    <div className="space-y-4">
      <div className={`${card} p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-[var(--p-muted)]">{loyalty.active ? "Activa" : "Pausada"} · cuenta pedidos desde el {new Date(loyalty.startsAt).toLocaleDateString("es-ES")}</p>
            <p className="mt-1 text-xl font-semibold">{loyalty.rewardName}</p>
            <p className="mt-1 text-sm text-[var(--p-muted)]">
              En el {n}.º pedido · {loyalty.rewardSlots.map((s) => s.label).join(" + ")}
              {loyalty.maxRewardCents ? ` · hasta ${euros(loyalty.maxRewardCents)}` : ""} · los extras se cobran
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button onClick={() => { setError(""); setForm(toForm(loyalty)); }} className="p-press rounded-full border border-[var(--p-line)] px-4 py-1.5 text-sm font-semibold hover:bg-black/[0.04]">
              Editar
            </button>
            <button onClick={() => save({ ...toForm(loyalty), active: !loyalty.active })} disabled={saving} className="p-press rounded-full px-4 py-1.5 text-sm font-semibold text-[var(--p-brand)] hover:bg-black/[0.04]">
              {loyalty.active ? "Pausar" : "Activar"}
            </button>
          </div>
        </div>
        {/* Así la ve el cliente: N−1 sellos y el premio */}
        <div className="mt-5 flex flex-wrap items-center gap-2" aria-hidden>
          {Array.from({ length: n - 1 }, (_, i) => (
            <span key={i} className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-dashed border-[var(--p-line)] text-xs text-[var(--p-faint)]">
              {i + 1}
            </span>
          ))}
          <span className="flex h-9 items-center rounded-full bg-[var(--p-brand)] px-3 text-xs font-semibold text-white">🎁 {n}.º gratis</span>
        </div>
        {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`${card} p-4`}>
          <p className="text-xs text-[var(--p-muted)]">Premios canjeados</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{loyalty.rewardsGiven}</p>
        </div>
        <div className={`${card} p-4`}>
          <p className="text-xs text-[var(--p-muted)]">Valor regalado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{euros(loyalty.rewardsCents)}</p>
        </div>
      </div>
    </div>
  );
}

function LoyaltyFields({ form, onChange, categories }: { form: Form; onChange: (f: Form) => void; categories: Overview["categories"] }) {
  const setSlot = (i: number, slot: Slot) => onChange({ ...form, slots: form.slots.map((s, j) => (j === i ? slot : s)) });
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>El premio llega en el pedido nº</label>
          <input value={form.ordersRequired} onChange={(e) => onChange({ ...form, ordersRequired: e.target.value.replace(/\D/g, "") })} inputMode="numeric" className={input} />
        </div>
        <div>
          <label className={label}>Cómo lo verá el cliente</label>
          <input value={form.rewardName} onChange={(e) => onChange({ ...form, rewardName: e.target.value })} maxLength={80} className={input} />
        </div>
      </div>

      <div>
        <p className={label}>Qué sale gratis</p>
        <p className="mb-3 text-xs text-[var(--p-muted)]">
          De cada grupo, el producto más caro que haya en el pedido. Solo el precio de la carta: los extras (salsas, ingredientes) se cobran.
        </p>
        <div className="space-y-3">
          {form.slots.map((slot, i) => (
            <div key={i} className="rounded-xl border border-[var(--p-line)] p-3">
              <div className="flex items-center gap-2">
                <input value={slot.label} onChange={(e) => setSlot(i, { ...slot, label: e.target.value })} placeholder="Bocadillo" className={`${input} min-w-0`} />
                {form.slots.length > 1 && (
                  <button type="button" onClick={() => onChange({ ...form, slots: form.slots.filter((_, j) => j !== i) })} className="p-press shrink-0 rounded-full px-3 py-1.5 text-xs text-[var(--p-muted)] hover:bg-black/[0.04]">
                    Quitar
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {categories.map((c) => {
                  const on = slot.categoryIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSlot(i, { ...slot, categoryIds: on ? slot.categoryIds.filter((x) => x !== c.id) : [...slot.categoryIds, c.id] })}
                      className={`p-press rounded-full px-3 py-1 text-xs font-medium ${on ? "bg-[var(--p-brand)] text-white" : "bg-black/[0.05] text-[var(--p-muted)]"}`}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {form.slots.length < 4 && (
            <button type="button" onClick={() => onChange({ ...form, slots: [...form.slots, { label: "", categoryIds: [] }] })} className="p-press rounded-full px-3 py-1.5 text-sm font-medium text-[var(--p-brand)] hover:bg-black/[0.04]">
              + Añadir otro producto al premio
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Tope del premio (€, opcional)</label>
          <input value={form.maxReward} onChange={(e) => onChange({ ...form, maxReward: e.target.value })} inputMode="decimal" placeholder="Sin tope" className={input} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(e) => onChange({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
          Tarjeta activa
        </label>
      </div>
    </div>
  );
}
