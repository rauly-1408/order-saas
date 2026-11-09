"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ui, type Lang } from "@/app/lib/i18n";

// «Confirmo que vamos»: el botón al que lleva el recordatorio del día antes.
export default function ConfirmAttendance({ tenant, code, lang }: { tenant: string; code: string; lang: Lang }) {
  const T = ui(lang);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/reservas/${tenant}/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm" }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error ?? "No se pudo confirmar");
      setBusy(false);
      return;
    }
    router.refresh();
  }
  return (
    <div className="mt-6">
      <button type="button" disabled={busy} onClick={confirm} className="p-press w-full rounded-full bg-[var(--brand-accent)] py-3.5 text-[15px] font-bold text-[var(--on-accent)] disabled:opacity-60 sm:w-auto sm:px-6">
        ✓ {T.bookGoConfirm}
      </button>
      {error && <p className="mt-2 text-[14px] font-semibold text-red-600" role="alert">{error}</p>}
    </div>
  );
}
