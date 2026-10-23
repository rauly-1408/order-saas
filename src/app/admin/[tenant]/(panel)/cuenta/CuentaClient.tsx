"use client";

import { useState } from "react";

// Datos del usuario y cambio de contraseña (PUT /api/admin/[tenant]/users/me).
export default function CuentaClient({ tenant, email, role, seesTakings }: { tenant: string; email: string; role: string; seesTakings: boolean }) {
  const [pw, setPw] = useState({ current: "", next: "", repeat: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = "mt-1 w-full rounded-lg border border-[var(--p-line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]";

  async function save() {
    setMsg(null);
    if (pw.next.length < 10) return setMsg({ ok: false, text: "La nueva contraseña necesita al menos 10 caracteres." });
    if (pw.next !== pw.repeat) return setMsg({ ok: false, text: "Las dos contraseñas nuevas no coinciden." });
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/${tenant}/users/me`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: pw.current, next: pw.next }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo cambiar");
      setPw({ current: "", next: "", repeat: "" });
      setMsg({ ok: true, text: "Contraseña cambiada. La próxima vez entra con la nueva." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo cambiar" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
      <section className="rounded-[18px] bg-[var(--p-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6">
        <p className="text-sm font-semibold">{email}</p>
        <p className="mt-0.5 text-sm text-[var(--p-muted)]">
          {role}
          {seesTakings ? " · ve lo recaudado" : ""}
        </p>
        <p className="mt-3 text-xs text-[var(--p-muted)]">Tus permisos los cambia el administrador en Configuración → Usuarios y permisos.</p>
      </section>
      <section className="rounded-[18px] bg-[var(--p-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6">
        <h2 className="font-semibold">Cambiar mi contraseña</h2>
        <label className="mt-3 block text-sm">
          Contraseña actual
          <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={input} />
        </label>
        <label className="mt-3 block text-sm">
          Nueva contraseña (mínimo 10 caracteres)
          <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={input} />
        </label>
        <label className="mt-3 block text-sm">
          Repite la nueva contraseña
          <input type="password" autoComplete="new-password" value={pw.repeat} onChange={(e) => setPw({ ...pw, repeat: e.target.value })} className={input} />
        </label>
        {msg && (
          <p className={`mt-3 text-sm ${msg.ok ? "text-emerald-700" : "text-[var(--p-accent)]"}`} role="status">
            {msg.text}
          </p>
        )}
        <button type="button" onClick={save} disabled={busy || !pw.current || !pw.next} className="p-press mt-4 rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </section>
    </div>
  );
}
