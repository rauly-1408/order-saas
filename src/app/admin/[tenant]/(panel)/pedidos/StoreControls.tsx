"use client";

import { useState } from "react";
import type { StoreStatus } from "@/app/lib/storeStatus";

// Controles en directo de la tienda online (cabecera de Pedidos): estado,
// pausar pedidos y tiempo extra de preparación para los picos de trabajo.

export type StoreLive = { status: StoreStatus; pausedUntil: string | null; prepExtraMinutes: number };

const PAUSES: { label: string; value: number | "indefinite" }[] = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hora", value: 60 },
  { label: "Hasta que la reabra", value: "indefinite" },
];
const EXTRAS = [0, 10, 20, 30];

export default function StoreControls({ tenant, live, onChange }: { tenant: string; live: StoreLive; onChange: () => Promise<void> }) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { status } = live;
  const paused = status.kind === "paused";

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/${tenant}/store`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo cambiar");
      await onChange();
      setMenu(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar");
    } finally {
      setBusy(false);
    }
  }

  const chip = status.open
    ? { cls: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500", text: "Tienda abierta" }
    : paused
      ? { cls: "bg-amber-50 text-amber-800", dot: "bg-amber-500", text: `En pausa${status.reopens ? ` hasta las ${status.reopens.replace("a las ", "")}` : ""}` }
      : { cls: "bg-[var(--p-accent-soft)] text-[var(--p-accent)]", dot: "bg-[var(--p-accent)]", text: `Cerrada${status.reopens ? ` · abre ${status.reopens}` : ""}` };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-[var(--p-surface)] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${chip.cls}`}>
          <span className={`h-2 w-2 rounded-full ${chip.dot}`} />
          {chip.text}
        </span>
        {live.prepExtraMinutes > 0 && <span className="text-xs text-[var(--p-muted)]">+{live.prepExtraMinutes} min en los tiempos</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-black/[0.05] p-1" role="group" aria-label="Tiempo extra de preparación">
          <span className="pl-2 pr-1 text-xs text-[var(--p-muted)]">Extra</span>
          {EXTRAS.map((m) => (
            <button
              key={m}
              disabled={busy}
              onClick={() => patch({ prepExtraMinutes: m })}
              aria-pressed={live.prepExtraMinutes === m}
              className={`p-press rounded-full px-2.5 py-1 text-xs font-semibold ${
                live.prepExtraMinutes === m ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"
              }`}
            >
              {m === 0 ? "0" : `+${m}`}
            </button>
          ))}
        </div>

        {paused ? (
          <button disabled={busy} onClick={() => patch({ pauseMinutes: 0 })} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            Reanudar pedidos
          </button>
        ) : (
          <div className="relative">
            <button
              disabled={busy}
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
              className="p-press rounded-full border border-[var(--p-line)] px-4 py-1.5 text-sm font-semibold text-[var(--p-ink)] hover:bg-black/[0.04] disabled:opacity-50"
            >
              Pausar pedidos
            </button>
            {menu && (
              <div className="absolute left-0 z-30 mt-2 w-52 overflow-hidden sm:left-auto sm:right-0 rounded-2xl bg-[var(--p-surface)] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.35)]">
                {PAUSES.map((p) => (
                  <button key={p.label} onClick={() => patch({ pauseMinutes: p.value })} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-black/[0.04]">
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-[var(--p-accent)] sm:basis-full">{error}</p>}
    </div>
  );
}
