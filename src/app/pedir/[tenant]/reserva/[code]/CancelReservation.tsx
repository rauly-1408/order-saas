"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ui, type Lang } from "@/app/lib/i18n";

// Cancelar en dos toques: «Cancelar la reserva» y luego «Sí, cancelar».
export default function CancelReservation({ tenant, code, lang }: { tenant: string; code: string; lang: Lang }) {
  const T = ui(lang);
  const router = useRouter();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/reservas/${tenant}/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", lang }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error ?? "No se pudo cancelar");
      setBusy(false);
      return;
    }
    router.refresh();
  }
  return (
    <div className="mt-6">
      {!sure ? (
        <button type="button" onClick={() => setSure(true)} className="p-press w-full rounded-full border-2 border-[var(--border)] py-3.5 text-[15px] font-bold text-[var(--text-primary)] sm:w-auto sm:px-6">
          {T.bookCancel}
        </button>
      ) : (
        <div className="rounded-2xl bg-black/[0.04] p-4" role="alertdialog" aria-label={T.bookCancelSure}>
          <p className="text-[15px] font-semibold">{T.bookCancelSure}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={cancel} className="p-press flex-1 rounded-full bg-red-600 py-3 text-[15px] font-bold text-white disabled:opacity-60">{T.bookCancelYes}</button>
            <button type="button" disabled={busy} onClick={() => setSure(false)} className="p-press flex-1 rounded-full border-2 border-[var(--border)] py-3 text-[15px] font-bold">{T.bookCancelNo}</button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[14px] font-semibold text-red-600" role="alert">{error}</p>}
    </div>
  );
}
