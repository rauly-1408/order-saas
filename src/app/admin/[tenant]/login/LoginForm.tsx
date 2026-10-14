"use client";

import { useState } from "react";

export default function LoginForm({ tenant }: { tenant: string }) {
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="mb-1 text-xl font-bold capitalize">{tenant}</h1>
        <p className="mb-6 text-sm text-zinc-400">Panel de pedidos — acceso</p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-zinc-400">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-zinc-500"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
