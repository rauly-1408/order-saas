"use client";

import { useState } from "react";
import { ui, type Lang } from "@/app/lib/i18n";

// «Cancelar pedido» en la página de seguimiento: solo mientras el restaurante
// no haya aceptado (o, programado, hasta una hora antes). Pide un motivo y
// confirma antes de cancelar. Ver docs/SEGUIMIENTO-Y-RESENAS.md

type Reason = "MISTAKE" | "ADDRESS_TIME" | "CHANGED_MIND";
type Props = { lang: Lang; orderId: string; scheduled: boolean; onCancelled: () => void; onTooLate: (message: string) => void };

export default function CancelOrder({ lang, orderId, scheduled, onCancelled, onTooLate }: Props) {
  const T = ui(lang);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const reasons: [Reason, string][] = [
    ["MISTAKE", T.reasonMistake],
    ["ADDRESS_TIME", T.reasonAddressTime],
    ["CHANGED_MIND", T.reasonChangedMind],
  ];

  async function confirm() {
    if (!reason || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/track/${orderId}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (res.ok) return onCancelled();
      if (json.code === "TOO_LATE") return onTooLate(json.error ?? T.tooLateCancel);
      setError(json.error ?? T.cancelFailed);
    } catch {
      setError(T.cancelFailed);
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-4 border-t border-[var(--border)] pt-3 text-[13px]">
        <p className="text-[var(--text-secondary)]">{scheduled ? T.cancelScheduled : T.cancelWhile}</p>
        <button type="button" onClick={() => setOpen(true)} className="p-press mt-2 rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--text-secondary)] hover:text-[var(--brand-secondary)]">
          {T.cancelOrder}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl bg-[var(--surface-0)] p-3" role="group" aria-label={T.cancelOrder}>
      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{T.cancelWhy}</p>
      <div className="mt-2 flex flex-col gap-1.5" role="radiogroup" aria-label={T.cancelWhy}>
        {reasons.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={reason === key}
            onClick={() => setReason(key)}
            className={`p-press rounded-xl border px-3 py-2.5 text-left text-[14px] ${reason === key ? "border-[var(--brand-accent)] bg-[var(--surface-1)] font-semibold text-[var(--text-primary)]" : "border-[var(--border)] text-[var(--text-secondary)]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setOpen(false)} disabled={sending} className="p-press rounded-full border border-[var(--border)] py-2.5 text-[13px] font-semibold text-[var(--text-secondary)]">
          {T.cancelKeep}
        </button>
        <button type="button" onClick={confirm} disabled={!reason || sending} className="p-press rounded-full bg-[var(--brand-secondary)] py-2.5 text-[13px] font-semibold text-[var(--on-secondary)] disabled:opacity-50">
          {sending ? T.cancelling : T.cancelConfirm}
        </button>
      </div>
      {error && <p className="mt-2 text-center text-[13px] text-[var(--brand-secondary)]">{error}</p>}
    </div>
  );
}
