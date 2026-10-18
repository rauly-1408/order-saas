"use client";

import { useCallback, useEffect, useState } from "react";

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
