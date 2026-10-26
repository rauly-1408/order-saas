"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, pushState, type PushState } from "@/app/lib/pushClient";

// «Avisos en este móvil»: el dueño recibe el aviso de stock bajo aunque tenga el
// panel cerrado. Cada dispositivo se activa por separado. Ver docs/AVISOS-MOVIL.md
export default function AvisosMovil({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/push`;
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    pushState().then(setState).catch(() => setState("unsupported"));
  }, []);

  async function toggle() {
    setBusy(true);
    setError("");
    try {
      setState(state === "on" ? await disablePush(api) : await enablePush(api));
    } catch {
      setError("No se pudieron activar. Inténtalo otra vez.");
    } finally {
      setBusy(false);
    }
  }

  if (!state || state === "unsupported") return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Avisos en este móvil</p>
        <p className="text-xs text-[var(--p-muted)]">
          {state === "on"
            ? "Activados: te avisamos cuando un ingrediente baje de su mínimo, aunque tengas el panel cerrado."
            : state === "ios-install"
              ? "En iPhone, primero añade el panel a tu pantalla de inicio (Compartir → «Añadir a pantalla de inicio») y ábrelo desde ahí."
              : state === "denied"
                ? "Los tienes bloqueados para esta página: actívalos en los ajustes del navegador."
                : "Recibe el aviso de stock bajo aunque tengas el panel cerrado."}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {(state === "on" || state === "off") && (
        <button type="button" onClick={toggle} disabled={busy} className={`p-press shrink-0 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${state === "on" ? "bg-black/[0.05] text-[var(--p-ink)]" : "bg-[var(--p-brand)] text-white"}`}>
          {busy ? "…" : state === "on" ? "Desactivar" : "Activar"}
        </button>
      )}
    </div>
  );
}
