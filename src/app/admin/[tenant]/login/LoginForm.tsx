"use client";

import { useState } from "react";

export default function LoginForm({ tenant, tenantName }: { tenant: string; tenantName: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, tenant }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No se pudo iniciar sesión");
        setLoading(false);
        return;
      }
      // Respeta ?next= si vino del middleware; si no, al panel del tenant.
      const params = new URLSearchParams(window.location.search);
      window.location.href = params.get("next") ?? `/admin/${tenant}`;
    } catch {
      setError("Error de red. Intenta de nuevo.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--p-warm)] px-4 py-10">
      <div className="p-rise w-full max-w-sm">
        <p className="text-center text-sm font-medium text-[var(--p-brand)]/70">Panel del restaurante</p>
        <h1 className="p-display mt-2 text-center text-6xl text-[var(--p-brand)]">{tenantName}</h1>

        <div className="mt-8 rounded-[28px] bg-[var(--p-surface)] p-6 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.35)] sm:p-8">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[var(--p-muted)]">Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full px-4 py-3 text-[15px] text-[var(--p-ink)]"
                placeholder="tu@email.com"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-[var(--p-muted)]">Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full px-4 py-3 text-[15px] text-[var(--p-ink)]"
                placeholder="••••••••"
              />
            </label>

            {error && <div className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>}

            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password}
              className="p-press w-full rounded-full bg-[var(--p-brand)] py-3.5 text-[15px] font-semibold text-white hover:bg-[var(--p-brand-strong)] disabled:opacity-40"
            >
              {loading ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
