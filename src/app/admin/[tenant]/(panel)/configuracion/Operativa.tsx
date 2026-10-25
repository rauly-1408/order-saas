"use client";

import { ask } from "@/app/lib/dialog";
import { useCallback, useEffect, useState } from "react";
import { toast, useSaveBar } from "./ui";
import { DAY_KEYS, DAY_LABEL, type DayKey, type TimeRange, type WeeklyHours } from "@/app/lib/storeStatus";

// Configuración operativa de la tienda online: horario semanal, cierres
// programados y zonas de reparto. Se guarda en el local (Store).

type Zone = { id: string; name: string; postalCodes: string[]; feeCents: number; minOrderCents: number; active: boolean };
type Closure = { id: string; startsAt: string; endsAt: string; reason: string | null };
type Ops = { hours: WeeklyHours; closures: Closure[]; zones: Zone[] };

const card = "rounded-[18px] bg-[var(--p-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6";
const input = "rounded-lg px-3 py-2 text-sm text-[var(--p-ink)]";
const btn = "p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const ghost = "p-press rounded-full px-3 py-1.5 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]";
const euros = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);
const toCents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const DEFAULT_RANGE: TimeRange = { from: "13:00", to: "16:00" };

export default function Operativa({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/store`;
  const [ops, setOps] = useState<Ops | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(
    () =>
      fetch(api, { cache: "no-store" })
        .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => {
          if (!ok || !json.ops) setError(json.error ?? "No se pudo cargar la operativa");
          else setOps(json.ops as Ops);
        })
        .catch(() => setError("No se pudo cargar la operativa")),
    [api]
  );

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-sm text-[var(--p-accent)]">{error}</p>;
  if (!ops) return <p className="py-6 text-center text-sm text-[var(--p-muted)]">Cargando horario y zonas…</p>;
  return (
    <div className="space-y-5">
      <Horario api={api} initial={ops.hours} onSaved={load} />
      <Cierres api={api} closures={ops.closures} onSaved={load} />
      <Zonas api={api} zones={ops.zones} onSaved={load} />
    </div>
  );
}

function Horario({ api, initial, onSaved }: { api: string; initial: WeeklyHours; onSaved: () => Promise<void> }) {
  const [hours, setHours] = useState<WeeklyHours>(initial);
  const setDay = (d: DayKey, ranges: TimeRange[]) => setHours({ ...hours, [d]: ranges });

  // Barra «Cambios sin guardar» (como Shopify).
  useSaveBar("horario", {
    dirty: JSON.stringify(hours) !== JSON.stringify(initial),
    discard: () => setHours(initial),
    save: async () => {
      const res = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hours }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error ?? "No se pudo guardar el horario", false);
        return false;
      }
      await onSaved();
      return true;
    },
  });

  return (
    <section className={card}>
      <h2 className="text-[17px] font-semibold">Horario de apertura</h2>
      <p className="mb-4 text-sm text-[var(--p-muted)]">Fuera de este horario la carta se puede ver, pero no se aceptan pedidos. Si no pones ningún horario, la tienda está siempre abierta.</p>
      <ul className="divide-y divide-[var(--p-line)]">
        {DAY_KEYS.map((d) => {
          const ranges = hours[d];
          return (
            <li key={d} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <label className="flex w-36 shrink-0 items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={ranges.length > 0} onChange={(e) => setDay(d, e.target.checked ? [DEFAULT_RANGE] : [])} className="h-4 w-4 accent-[var(--p-brand)]" />
                {DAY_LABEL[d]}
              </label>
              {ranges.length === 0 ? (
                <span className="text-sm text-[var(--p-faint)]">Cerrado</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {ranges.map((r, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <input type="time" value={r.from} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} className={input} aria-label={`${DAY_LABEL[d]}: apertura`} />
                      <span className="text-[var(--p-muted)]">–</span>
                      <input type="time" value={r.to} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className={input} aria-label={`${DAY_LABEL[d]}: cierre`} />
                      {ranges.length > 1 && (
                        <button onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} aria-label="Quitar franja" className="px-1 text-[var(--p-faint)] hover:text-[var(--p-accent)]">✕</button>
                      )}
                    </span>
                  ))}
                  {ranges.length < 2 && (
                    <button onClick={() => setDay(d, [...ranges, { from: "20:00", to: "23:30" }])} className="text-sm font-medium text-[var(--p-brand)]">
                      + franja
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-[var(--p-muted)]">Para cerrar después de medianoche pon, por ejemplo, 20:00 – 02:00.</p>
    </section>
  );
}

function Cierres({ api, closures, onSaved }: { api: string; closures: Closure[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<{ from: string; to: string; reason: string } | null>(null);
  const [error, setError] = useState("");
  const fmt = (iso: string) => new Date(iso).toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  async function add() {
    if (!form) return;
    setError("");
    const res = await fetch(`${api}/closures`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // datetime-local va en hora del dispositivo: se envía como instante exacto.
      body: JSON.stringify({ startsAt: new Date(form.from).toISOString(), endsAt: new Date(form.to).toISOString(), reason: form.reason }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "No se pudo guardar");
    setForm(null);
    await onSaved();
  }

  async function remove(id: string) {
    await fetch(`${api}/closures/${id}`, { method: "DELETE" });
    await onSaved();
  }

  return (
    <section className={card}>
      <h2 className="text-[17px] font-semibold">Cierres programados</h2>
      <p className="mb-4 text-sm text-[var(--p-muted)]">Vacaciones, festivos o días especiales. Durante el cierre no se aceptan pedidos.</p>
      {closures.length > 0 && (
        <ul className="mb-4 divide-y divide-[var(--p-line)]">
          {closures.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span>
                <span className="font-medium">{c.reason ?? "Cerrado"}</span>
                <span className="text-[var(--p-muted)]"> · del {fmt(c.startsAt)} al {fmt(c.endsAt)}</span>
              </span>
              <button onClick={() => remove(c.id)} className={ghost}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
      {form ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-[13px] font-medium text-[var(--p-muted)]">Desde<input type="datetime-local" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className={`${input} mt-1 block w-full`} /></label>
          <label className="text-[13px] font-medium text-[var(--p-muted)]">Hasta<input type="datetime-local" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={`${input} mt-1 block w-full`} /></label>
          <label className="text-[13px] font-medium text-[var(--p-muted)]">Motivo (opcional)<input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Vacaciones" className={`${input} mt-1 block w-full`} /></label>
          <div className="flex gap-2 sm:col-span-3">
            <button onClick={add} disabled={!form.from || !form.to} className={btn}>Añadir cierre</button>
            <button onClick={() => setForm(null)} className={ghost}>Cancelar</button>
          </div>
          {error && <p className="text-sm text-[var(--p-accent)] sm:col-span-3">{error}</p>}
        </div>
      ) : (
        <button onClick={() => setForm({ from: "", to: "", reason: "" })} className="text-sm font-semibold text-[var(--p-brand)]">+ Programar un cierre</button>
      )}
    </section>
  );
}

type ZoneForm = { id: string | null; name: string; postalCodes: string; fee: string; min: string; active: boolean };

function Zonas({ api, zones, onSaved }: { api: string; zones: Zone[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<ZoneForm | null>(null);
  const [error, setError] = useState("");

  async function save() {
    if (!form) return;
    setError("");
    const body = { name: form.name, postalCodes: form.postalCodes, feeCents: toCents(form.fee || "0"), minOrderCents: form.min ? toCents(form.min) : 0, active: form.active };
    const res = await fetch(form.id ? `${api}/zones/${form.id}` : `${api}/zones`, { method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return setError(json.error ?? "No se pudo guardar");
    setForm(null);
    await onSaved();
  }

  async function remove(z: Zone) {
    if (!(await ask(`¿Borrar la zona "${z.name}"?`))) return;
    await fetch(`${api}/zones/${z.id}`, { method: "DELETE" });
    await onSaved();
  }

  const edit = (z: Zone) => {
    setError("");
    setForm({ id: z.id, name: z.name, postalCodes: z.postalCodes.join(", "), fee: (z.feeCents / 100).toFixed(2).replace(".", ","), min: z.minOrderCents ? (z.minOrderCents / 100).toFixed(2).replace(".", ",") : "", active: z.active });
  };

  return (
    <section className={card}>
      <h2 className="text-[17px] font-semibold">Zonas de reparto</h2>
      <p className="mb-4 text-sm text-[var(--p-muted)]">
        Con zonas, el cliente indica su código postal y se aplica el envío y el mínimo de su zona. Solo se reparte a los códigos postales de las zonas activas. Sin zonas, se usa el envío general de arriba.
      </p>
      {zones.length > 0 && (
        <ul className="mb-4 divide-y divide-[var(--p-line)]">
          {zones.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {z.name} {!z.active && <span className="ml-1 rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-[var(--p-faint)]">Desactivada</span>}
                </p>
                <p className="text-xs text-[var(--p-muted)]">
                  {z.postalCodes.join(", ")} · envío {z.feeCents === 0 ? "gratis" : euros(z.feeCents)}
                  {z.minOrderCents > 0 && ` · mínimo ${euros(z.minOrderCents)}`}
                </p>
              </div>
              <div className="flex gap-1">
                <button onClick={() => edit(z)} className="p-press rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--p-brand)] hover:bg-black/[0.04]">Editar</button>
                <button onClick={() => remove(z)} className={ghost}>Borrar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {form ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-[var(--p-muted)]">Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Centro" className={`${input} mt-1 block w-full`} /></label>
          <label className="text-[13px] font-medium text-[var(--p-muted)]">Códigos postales<input value={form.postalCodes} onChange={(e) => setForm({ ...form, postalCodes: e.target.value })} placeholder="18001, 18002, 18009" className={`${input} mt-1 block w-full`} /></label>
          <label className="text-[13px] font-medium text-[var(--p-muted)]">Envío (€)<input inputMode="decimal" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} placeholder="0 = gratis" className={`${input} mt-1 block w-full`} /></label>
          <label className="text-[13px] font-medium text-[var(--p-muted)]">Pedido mínimo (€)<input inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} placeholder="Sin mínimo" className={`${input} mt-1 block w-full`} /></label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
            Zona activa
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button onClick={save} disabled={!form.name || !form.postalCodes} className={btn}>{form.id ? "Guardar zona" : "Añadir zona"}</button>
            <button onClick={() => setForm(null)} className={ghost}>Cancelar</button>
          </div>
          {error && <p className="text-sm text-[var(--p-accent)] sm:col-span-2">{error}</p>}
        </div>
      ) : (
        <button onClick={() => { setError(""); setForm({ id: null, name: "", postalCodes: "", fee: "", min: "", active: true }); }} className="text-sm font-semibold text-[var(--p-brand)]">
          + Nueva zona de reparto
        </button>
      )}
    </section>
  );
}
