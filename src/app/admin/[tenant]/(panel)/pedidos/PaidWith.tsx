"use client";

// Pregunta «¿Cómo ha pagado?» al entregar o al apuntar el cobro de un pedido
// pendiente (al recoger / al entregar). Ver docs/CAJA.md
export type PaidWith = "CASH" | "CARD_TERMINAL" | "BIZUM";

const OPTIONS: [PaidWith, string][] = [
  ["CASH", "Efectivo"],
  ["CARD_TERMINAL", "Datáfono"],
  ["BIZUM", "Bizum"],
];

export default function PaidWithChooser({ title = "¿Cómo ha pagado?", busy, onPick, onCancel, compact = false }: { title?: string; busy?: boolean; onPick: (m: PaidWith) => void; onCancel: () => void; compact?: boolean }) {
  return (
    <div className={`rounded-2xl bg-[var(--p-bg)] ${compact ? "p-2" : "mt-3 p-3"}`} role="group" aria-label={title}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <button type="button" onClick={onCancel} className="rounded-full px-2 py-0.5 text-xs text-[var(--p-muted)] hover:bg-black/[0.05]">
          Volver
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {OPTIONS.map(([m, label]) => (
          <button key={m} type="button" disabled={busy} onClick={() => onPick(m)} className="p-press rounded-xl bg-[var(--p-surface)] py-2.5 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-50">
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
