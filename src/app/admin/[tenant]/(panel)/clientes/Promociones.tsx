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
};

const EMPTY: Form = { id: null, name: "", kind: "ORDER_PERCENT", value: "10", minOrder: "", weekdays: [], allDay: true, startTime: "20:00", endTime: "23:00", channel: "", firstOrderOnly: false, startsAt: "", endsAt: "" };

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
          value: form.kind === "ORDER_PERCENT" ? Number(form.value) : form.kind === "ORDER_FIXED" ? toCents(form.value) : 0,
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
          <PromotionFields form={form} onChange={setForm} />
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

function PromotionFields({ form, onChange }: { form: Form; onChange: (f: Form) => void }) {
  const toggleDay = (d: number) => onChange({ ...form, weekdays: form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d] });
  const pill = (on: boolean) => `p-press rounded-full px-3 py-1 text-sm font-medium ${on ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className={label}>Nombre (lo verán tus clientes)</label>
        <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="Martes de recogida" maxLength={60} className={input} />
      </div>
      <div>
        <label className={label}>Qué se lleva el cliente</label>
        <div className="flex flex-wrap gap-1 rounded-2xl bg-black/[0.05] p-1 sm:w-fit sm:rounded-full">
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => onChange({ ...form, kind: k.key })} className={pill(form.kind === k.key)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>
      {form.kind !== "FREE_DELIVERY" && (
        <div>
          <label className={label}>{form.kind === "ORDER_PERCENT" ? "Descuento (%)" : "Descuento (€)"}</label>
          <input value={form.value} onChange={(e) => onChange({ ...form, value: e.target.value })} inputMode="decimal" className={input} />
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
