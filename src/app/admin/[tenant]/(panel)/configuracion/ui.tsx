"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Piezas comunes de los apartados de Configuración (estilo Shopify: tarjetas
// blancas con título, explicación y botón de guardar).
export const card = "rounded-[18px] bg-[var(--p-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6";
export const input = "mt-1 w-full rounded-lg border border-[var(--p-line)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
export const primaryBtn = "p-press rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
export const ghostBtn = "p-press rounded-full border border-[var(--p-line)] px-4 py-2 text-sm font-medium disabled:opacity-50";
export const euros = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

export function Card({ title, description, children, footer }: { title: string; description?: React.ReactNode; children?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <section className={card}>
      <p className="text-[15px] font-semibold">{title}</p>
      {description && <p className="mt-1 text-sm text-[var(--p-muted)]">{description}</p>}
      {children && <div className="mt-4">{children}</div>}
      {footer && <div className="mt-5 flex flex-wrap items-center gap-3">{footer}</div>}
    </section>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span className="text-sm">
        <span className="font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-[var(--p-muted)]">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--p-brand)]" />
    </label>
  );
}

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-[var(--p-accent)]"}`}>{msg.text}</p>;
}

// Lee Tenant.settings y guarda una parte (PATCH /api/admin/[tenant]).
export function useTenantSettings(tenant: string) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/admin/${tenant}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => setSettings((d.tenant?.settings ?? {}) as Record<string, unknown>))
      .catch(() => setError("No se pudo cargar la configuración"));
  }, [tenant]);
  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/admin/${tenant}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: patch }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      setSettings((json.tenant?.settings ?? { ...(settings ?? {}), ...patch }) as Record<string, unknown>);
    },
    [tenant, settings]
  );
  return { settings, error, save };
}

// ─── Barra «Cambios sin guardar» y avisos, como en Shopify ─────────────────
// Cada formulario se apunta con useSaveBar(); una sola barra arriba guarda o
// descarta todo lo pendiente de la página. Al guardar sale un aviso flotante.

type SaveReg = { dirty: boolean; save: () => Promise<boolean>; discard: () => void };
const regs = new Map<string, { current: SaveReg }>();
const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// save() devuelve true si se guardó; si falla, avisa con toast() y devuelve false.
export function useSaveBar(id: string, reg: SaveReg) {
  const ref = useRef(reg);
  useEffect(() => {
    ref.current = reg;
    emit();
  });
  useEffect(() => {
    regs.set(id, ref);
    emit();
    return () => {
      regs.delete(id);
      emit();
    };
  }, [id]);
}

const dirtyRegs = () => [...regs.values()].map((r) => r.current).filter((r) => r.dirty);

export function toast(text: string, ok = true) {
  window.dispatchEvent(new CustomEvent("cfg-toast", { detail: { text, ok } }));
}

// Va una vez en el layout de Configuración.
export function SaveBarHost() {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const pending = dirtyRegs();
  const dirty = pending.length > 0;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; ok: boolean; id: number } | null>(null);

  // Avisos flotantes (se van solos).
  useEffect(() => {
    const on = (e: Event) => setNote({ ...(e as CustomEvent<{ text: string; ok: boolean }>).detail, id: Date.now() });
    window.addEventListener("cfg-toast", on);
    return () => window.removeEventListener("cfg-toast", on);
  }, []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), note.ok ? 2600 : 5000);
    return () => clearTimeout(t);
  }, [note]);

  // Con cambios sin guardar: aviso al cerrar la pestaña o al irse a otro apartado.
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]");
      if (!a || a.getAttribute("target") === "_blank") return;
      if (!confirm("Tienes cambios sin guardar. ¿Salir sin guardarlos?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  async function saveAll() {
    setBusy(true);
    let ok = true;
    for (const r of dirtyRegs()) {
      if (!(await r.save())) {
        ok = false;
        break;
      }
    }
    setBusy(false);
    if (ok) toast("Cambios guardados");
  }

  return (
    <>
      {dirty && (
        <div role="region" aria-label="Cambios sin guardar" className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 bg-[#1a1a1a] px-4 py-2.5 text-white shadow-lg sm:px-8">
          <span className="flex-1 text-sm font-medium">⚠️ Cambios sin guardar</span>
          <button type="button" disabled={busy} onClick={() => dirtyRegs().forEach((r) => r.discard())} className="p-press rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50">
            Descartar
          </button>
          <button type="button" disabled={busy} onClick={saveAll} className="p-press rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-[#1a1a1a] disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      )}
      {note && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div key={note.id} role="status" className={`p-rise flex max-w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${note.ok ? "bg-[#1a1a1a]" : "bg-[#b42318]"}`}>
            <span aria-hidden>{note.ok ? "✓" : "!"}</span>
            {note.text}
          </div>
        </div>
      )}
    </>
  );
}
