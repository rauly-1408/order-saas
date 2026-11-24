"use client";

import { useCallback, useEffect, useState } from "react";

// «Dejar la caja»: el encargado o el gerente presta la caja a un camarero
// (abrir y cerrar turnos con su propio usuario, para que quede apuntado quién
// lo hizo) y, si hace falta, también el cierre del día. A quien es de Caja solo
// se le puede dejar el cierre del día. Se quita sola al cerrar el día (Z) o a
// las 14 horas. Lista plegable: cerrada solo dice a quién está prestada.
// Ver docs/CAJA.md

type Staff = { id: string; name: string; puesto: string; isCaja: boolean; on: boolean; until: string | null; closeDay: boolean; grantedBy: string | null };

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

export default function LendCaja({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/caja/prestar`;
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { staff: Staff[] }) => setStaff(d.staff))
      .catch(() => setError("No se ha podido cargar el personal."));
  }, [api]);
  useEffect(() => {
    load();
  }, [load]);

  async function set(u: Staff, on: boolean, closeDay: boolean) {
    setBusy(u.id);
    setError("");
    try {
      const r = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u.id, on, closeDay }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "No se ha podido guardar");
      setStaff(j.staff);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido guardar");
    } finally {
      setBusy(null);
    }
  }

  if (!staff || staff.length === 0) return null; // sin camareros, nada que prestar
  const lent = staff.filter((u) => u.on);

  return (
    <section aria-label="Dejar la caja" className="mt-4 rounded-3xl bg-[var(--p-surface)] p-5 ring-1 ring-[var(--p-line)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:p-6">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 text-left">
        <span aria-hidden className={`text-[var(--p-muted)] transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">Dejar la caja a otra persona</span>
          <span className="block text-sm text-[var(--p-muted)]">
            {lent.length ? `Ahora la tiene: ${lent.map((u) => u.name).join(", ")}` : "Si faltas, deja que un camarero abra la caja y cierre turnos con su usuario."}
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-3">
          <p className="text-xs text-[var(--p-muted)]">
            Con la caja prestada podrá abrirla y cerrar turnos (X); contará a ciegas, sin ver lo recaudado. El cierre del día (Z) solo si se lo dejas. Se quita sola al cerrar el día.
          </p>
          <ul className="mt-3 space-y-2 rounded-2xl bg-[var(--p-bg)] p-2">
            {staff.map((u) => (
              <li key={u.id} className="rounded-2xl bg-[var(--p-surface)] px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{u.name}</span>
                    <span className="block truncate text-xs text-[var(--p-muted)]">
                      {u.puesto}
                      {u.on && ` · prestada${u.grantedBy ? ` por ${u.grantedBy}` : ""}${u.until ? ` hasta las ${hhmm(u.until)}` : ""}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={u.on}
                    disabled={busy === u.id}
                    onClick={() => set(u, !u.on, u.isCaja)}
                    className={`p-press min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold disabled:opacity-50 ${u.on ? "bg-[var(--p-brand)] text-[var(--p-on-brand)]" : "bg-black/[0.05]"}`}
                  >
                    {u.on ? "Quitar" : u.isCaja ? "Dejar el cierre del día" : "Dejar la caja"}
                  </button>
                </div>
                {u.on && !u.isCaja && (
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" checked={u.closeDay} disabled={busy === u.id} onChange={(e) => set(u, true, e.target.checked)} className="h-5 w-5 accent-[var(--p-brand)]" />
                    También el cierre del día (Z)
                  </label>
                )}
              </li>
            ))}
          </ul>
          {error && (
            <p className="mt-2 text-sm text-[var(--p-accent)]" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
