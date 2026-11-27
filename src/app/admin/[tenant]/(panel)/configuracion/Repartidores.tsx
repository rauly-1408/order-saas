"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "./ui";

type Rider = {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
};

type RiderForm = { name: string; phone: string; notes: string };
const emptyForm: RiderForm = { name: "", phone: "", notes: "" };

function BikeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </svg>
  );
}

const inputClass = "w-full rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2.5 text-sm text-[var(--p-ink)] outline-none focus:border-[var(--p-brand)]";
const buttonClass = "p-press inline-flex h-9 items-center justify-center rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 text-sm font-medium disabled:opacity-50";

export default function Repartidores({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/repartidores`;
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RiderForm>(emptyForm);

  const load = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { couriers?: Rider[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los repartidores");
      setRiders(Array.isArray(json.couriers) ? json.couriers : []);
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudieron cargar los repartidores", false);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function startEdit(rider: Rider) {
    setEditingId(rider.id);
    setForm({ name: rider.name, phone: rider.phone ?? "", notes: rider.notes ?? "" });
    setFormOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      toast("Introduce el nombre del repartidor", false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editingId ? `${api}/${editingId}` : api, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json().catch(() => ({}))) as { courier?: Rider; error?: string };
      if (!res.ok || !json.courier) throw new Error(json.error ?? "No se pudo guardar el repartidor");
      setRiders((current) => editingId
        ? current.map((r) => r.id === editingId ? json.courier! : r)
        : [...current, json.courier!].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es")));
      setFormOpen(false);
      setForm(emptyForm);
      setEditingId(null);
      toast(editingId ? "Repartidor actualizado" : "Repartidor agregado");
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo guardar el repartidor", false);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(rider: Rider, active: boolean) {
    const action = active ? "reactivar" : "dar de baja";
    if (!window.confirm(`¿Quieres ${action} a ${rider.name}?`)) return;
    try {
      const res = await fetch(`${api}/${rider.id}`, {
        method: active ? "PATCH" : "DELETE",
        ...(active ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) } : {}),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `No se pudo ${action} el repartidor`);
      setRiders((current) => current.map((r) => r.id === rider.id ? { ...r, active } : r)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "es")));
      toast(active ? "Repartidor reactivado" : "Repartidor dado de baja");
    } catch (error) {
      toast(error instanceof Error ? error.message : `No se pudo ${action} el repartidor`, false);
    }
  }

  const activeCount = riders.filter((r) => r.active).length;

  return (
    <section className="rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-6 md:col-span-2 md:gap-6 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <BikeIcon />
            <h3 className="text-sm font-bold leading-[22px] text-[var(--p-ink)] md:text-xl md:font-semibold md:leading-[26px] md:tracking-tight">Repartidores</h3>
            {!loading && <span className="rounded-full bg-[var(--p-brand-soft)] px-2 py-0.5 text-xs font-medium text-[var(--p-brand-strong)]">{activeCount} activos</span>}
          </div>
          <p className="text-sm text-[var(--p-muted)]">Gestiona las personas que realizan las entregas a domicilio de tu comercio.</p>
        </div>
        <button type="button" onClick={startCreate} className="p-press inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2 text-sm font-medium shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
          Agregar repartidor
        </button>
      </div>

      {formOpen && (
        <div className="mt-5 rounded-xl border border-[var(--p-line)] bg-[var(--p-bg)] p-4">
          <h4 className="mb-3 text-sm font-semibold text-[var(--p-ink)]">{editingId ? "Editar repartidor" : "Nuevo repartidor"}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-[var(--p-muted)]">Nombre *
              <input autoFocus maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre y apellido" className={`${inputClass} mt-1.5`} />
            </label>
            <label className="text-xs font-medium text-[var(--p-muted)]">Teléfono
              <input maxLength={30} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="600 000 000" className={`${inputClass} mt-1.5`} />
            </label>
            <label className="text-xs font-medium text-[var(--p-muted)] sm:col-span-2">Notas (opcional)
              <textarea maxLength={500} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Información interna…" className={`${inputClass} mt-1.5 resize-y`} />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => setFormOpen(false)} className={buttonClass}>Cancelar</button>
            <button type="button" disabled={saving} onClick={() => void save()} className="p-press inline-flex h-9 items-center justify-center rounded-xl bg-[var(--p-brand)] px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar repartidor"}</button>
          </div>
        </div>
      )}

      <div className="mt-5">
        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--p-muted)]">Cargando repartidores…</p>
        ) : riders.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="text-[var(--p-muted)]"><BikeIcon className="h-8 w-8" /></div>
            <p className="text-sm font-semibold leading-5 text-[var(--p-ink)]">Aún no hay repartidores</p>
            <p className="max-w-[17.5rem] text-sm font-normal leading-[1.375rem] text-[var(--p-muted)]">Agrega tus repartidores para asignarles pedidos a domicilio e imprimir sus códigos de acceso.</p>
            <button type="button" onClick={startCreate} className={`${buttonClass} mt-2`}>Agregar el primero</button>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {riders.map((rider) => (
              <li key={rider.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-[var(--p-ink)]">{rider.name}</p>
                    <span className={rider.active ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700" : "rounded-full bg-[var(--p-bg)] px-2 py-0.5 text-xs font-medium text-[var(--p-muted)]"}>{rider.active ? "Activo" : "Inactivo"}</span>
                  </div>
                  {rider.phone && <p className="mt-1 text-sm text-[var(--p-muted)]">{rider.phone}</p>}
                  {rider.notes && <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--p-muted)]">{rider.notes}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" onClick={() => startEdit(rider)} className={buttonClass}>Editar</button>
                  <button type="button" onClick={() => void setActive(rider, !rider.active)} className={buttonClass}>{rider.active ? "Dar de baja" : "Reactivar"}</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--p-line)] pt-4">
        <p className="text-xs text-[var(--p-muted)]">Los repartidores inactivos se conservan en el historial y pueden reactivarse.</p>
        <button type="button" disabled title="La impresión de códigos se habilitará en la siguiente fase" className={`${buttonClass} opacity-50`}>Imprimir códigos · Próximamente</button>
      </div>
    </section>
  );
}
