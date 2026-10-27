"use client";

import { useState } from "react";

export default function ForgotForm({ tenant, tenantName }: { tenant: string; tenantName: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "noEmail">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    setState("sending");
    try {
      const res = await fetch("/api/auth/password/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, tenant }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; noEmail?: boolean; error?: string };
      if (data.noEmail) return setState("noEmail");
      if (!res.ok || !data.ok) {
        setError(data.error ?? (res.status === 429 ? "Demasiados intentos. Espera unos minutos." : "No se pudo enviar. Inténtalo de nuevo."));
        return setState("idle");
      }
      setState("sent");
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
          <h2 className="text-lg font-semibold">¿Has olvidado tu contraseña?</h2>
          {state === "sent" ? (
            <div className="mt-3 space-y-3 text-[15px]">
              <p>
                Si <b className="break-all">{email}</b> tiene acceso al panel, te acabamos de enviar un email con un enlace para poner una contraseña nueva.
              </p>
              <p className="text-sm text-[var(--p-muted)]">Caduca en 1 hora. Si no lo ves, mira en «Spam» o «Promociones».</p>
            </div>
          ) : state === "noEmail" ? (
            <div className="mt-3 space-y-3 text-[15px]">
              <p>Ahora mismo no podemos enviar emails desde el panel.</p>
              <p className="text-sm text-[var(--p-muted)]">Si trabajas en el restaurante, pide al gerente que te dé una contraseña nueva en Configuración → Usuarios. Si eres el gerente, contacta con soporte.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <p className="text-sm text-[var(--p-muted)]">Escribe el email con el que entras y te enviaremos un enlace para poner una nueva.</p>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-[var(--p-muted)]">Email</span>
                <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email && send()} className="w-full px-4 py-3 text-[15px] text-[var(--p-ink)]" placeholder="tu@email.com" />
              </label>
              {error && <div className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>}
              <button onClick={send} disabled={state === "sending" || !email} className="p-press w-full rounded-full bg-[var(--p-brand)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--p-brand-strong)] disabled:opacity-40">
                {state === "sending" ? "Enviando…" : "Enviarme el enlace"}
              </button>
            </div>
          )}
        </div>
        <p className="mt-5 text-center text-sm">
          <a href={`/admin/${tenant}/login`} className="font-medium text-[var(--p-brand)] hover:underline">
            ← Volver a entrar
          </a>
        </p>
      </div>
    </div>
  );
}
