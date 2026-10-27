"use client";

import { useState } from "react";

const MIN = 10;

export default function ResetForm({ tenant, tenantName, token, valid }: { tenant: string; tenantName: string; token: string; valid: boolean }) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const mismatch = repeat.length > 0 && repeat !== password;

  async function save() {
    if (password.length < MIN) return setError(`Usa al menos ${MIN} caracteres.`);
    if (password !== repeat) return setError("Las dos contraseñas no coinciden.");
    setError(null);
    setState("saving");
    try {
      const res = await fetch("/api/auth/password/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No se pudo cambiar. Inténtalo de nuevo.");
        return setState("idle");
      }
      setState("done");
    } catch {
      setError("Error de red. Intenta de nuevo.");
      setState("idle");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--p-warm)] px-4 py-10">
      <div className="p-rise w-full max-w-sm">
        <p className="text-center text-sm font-medium text-[var(--p-brand)]/70">Panel del restaurante</p>
        <h1 className="p-display mt-2 text-center text-6xl text-[var(--p-brand)] [overflow-wrap:anywhere]">{tenantName}</h1>

        <div className="mt-8 rounded-[28px] bg-[var(--p-surface)] p-6 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)] sm:p-8">
          {state === "done" ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Contraseña cambiada ✓</h2>
              <p className="text-[15px]">Ya puedes entrar con tu contraseña nueva. Por seguridad, se han cerrado las sesiones que tuvieras abiertas en otros dispositivos.</p>
              <a href={`/admin/${tenant}/login`} className="p-press block w-full rounded-full bg-[var(--p-brand)] py-3.5 text-center text-[15px] font-semibold text-white no-underline">
                Entrar al panel
              </a>
            </div>
          ) : !valid ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Este enlace ya no sirve</h2>
              <p className="text-[15px]">Ha caducado (dura 1 hora) o ya se ha usado. Pide uno nuevo.</p>
              <a href={`/admin/${tenant}/recuperar`} className="p-press block w-full rounded-full bg-[var(--p-brand)] py-3.5 text-center text-[15px] font-semibold text-white no-underline">
                Pedir otro enlace
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Pon tu contraseña nueva</h2>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[var(--p-muted)]">Contraseña nueva (mínimo {MIN} caracteres)</span>
                <input type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-3 text-[15px] text-[var(--p-ink)]" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[var(--p-muted)]">Repítela</span>
                <input type={show ? "text" : "password"} autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className="w-full px-4 py-3 text-[15px] text-[var(--p-ink)]" aria-invalid={mismatch} />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--p-muted)]">
                <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} className="h-4 w-4" />
                Mostrar la contraseña
              </label>
              {(error || mismatch) && <div className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error ?? "Las dos contraseñas no coinciden."}</div>}
              <button onClick={save} disabled={state === "saving" || password.length < MIN || password !== repeat} className="p-press w-full rounded-full bg-[var(--p-brand)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--p-brand-strong)] disabled:opacity-40">
                {state === "saving" ? "Guardando…" : "Guardar contraseña"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
