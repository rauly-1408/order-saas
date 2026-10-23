"use client";

import { useEffect, useState } from "react";
import { ROLE_LABEL } from "@/app/lib/roles";
import { Card, Msg, ghostBtn, input, primaryBtn, toast } from "../ui";

type User = { id: string; email: string; name: string | null; role: string; active: boolean; storeId: string | null; seesTakings: boolean; lastLoginAt: string | null; me: boolean };
type Store = { id: string; name: string };

// Usuarios y permisos: Gerente (todo) o Pedidos (pedidos y caja, de un local o de todos).
export default function Usuarios({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/users`;
  const [users, setUsers] = useState<User[] | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState({ email: "", name: "", role: "STORE_MANAGER", storeId: "" });
  const [secret, setSecret] = useState<{ email: string; password: string; emailed: boolean } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState({ current: "", next: "" });

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => {
        setUsers(d.users);
        setStores(d.stores);
      })
      .catch(() => setMsg({ ok: false, text: "No se pudieron cargar los usuarios" }));
  }, [api]);

  async function call(kind: string, method: string, body: unknown, email?: string) {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(api, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Algo ha fallado");
      setUsers(json.users);
      if (json.password && email) setSecret({ email, password: json.password, emailed: !!json.emailed });
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Algo ha fallado", false);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function changePassword() {
    const res = await fetch(`${api}/me`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pw) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setPw({ current: "", next: "" });
      toast("Contraseña cambiada");
    } else toast(json.error ?? "No se pudo cambiar", false);
  }

  const storeName = (id: string | null) => (id ? stores.find((s) => s.id === id)?.name ?? "—" : "Todos los locales");

  return (
    <div className="space-y-5">
      {secret && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <p className="font-semibold">Contraseña de {secret.email}</p>
          <p className="mt-1 font-mono text-base tracking-wide">{secret.password}</p>
          <p className="mt-1 text-xs">{secret.emailed ? "Se la hemos enviado también a su email." : "Dásela a esa persona en mano."} No se vuelve a mostrar; puede cambiarla al entrar.</p>
          <button type="button" onClick={() => setSecret(null)} className="mt-2 text-xs font-semibold underline">
            Ya la he apuntado
          </button>
        </div>
      )}

      <Card title="Usuarios" description="Gerente: todo el panel. Pedidos: solo pedidos y Caja (ideal para cocina o encargados). Ventas, informes y lo recaudado solo los ve quien tenga marcado «Ve lo recaudado».">
        {!users ? (
          <p className="text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {users.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold">
                    {u.name || u.email} {u.me && <span className="font-normal text-[var(--p-muted)]">(tú)</span>}
                    {!u.active && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-medium text-[var(--p-muted)]">Desactivado</span>}
                  </p>
                  <p className="truncate text-xs text-[var(--p-muted)]">
                    {u.email} · {ROLE_LABEL[u.role] ?? u.role}
                    {u.role === "STORE_MANAGER" && stores.length > 1 ? ` · ${storeName(u.storeId)}` : ""}
                    {u.seesTakings ? " · ve lo recaudado" : ""}
                    {u.lastLoginAt ? ` · última entrada ${new Date(u.lastLoginAt).toLocaleDateString("es-ES")}` : " · nunca ha entrado"}
                  </p>
                </div>
                {!u.me && (
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={u.role}
                      onChange={(e) => call(`role-${u.id}`, "PATCH", { id: u.id, role: e.target.value })}
                      disabled={!!busy}
                      className="rounded-full border border-[var(--p-line)] bg-transparent px-3 py-1.5 text-xs"
                      aria-label={`Permiso de ${u.email}`}
                    >
                      <option value="TENANT_ADMIN">Gerente</option>
                      <option value="STORE_MANAGER">Pedidos</option>
                    </select>
                    {u.role === "STORE_MANAGER" && stores.length > 1 && (
                      <select
                        value={u.storeId ?? ""}
                        onChange={(e) => call(`store-${u.id}`, "PATCH", { id: u.id, storeId: e.target.value })}
                        disabled={!!busy}
                        className="rounded-full border border-[var(--p-line)] bg-transparent px-3 py-1.5 text-xs"
                        aria-label={`Local de ${u.email}`}
                      >
                        <option value="">Todos los locales</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className={`flex items-center gap-1.5 rounded-full border border-[var(--p-line)] px-3 py-1.5 text-xs ${busy ? "opacity-50" : ""}`} title="Puede ver lo recaudado del día en la Caja">
                      <input type="checkbox" checked={u.seesTakings} disabled={!!busy} onChange={(e) => call(`takings-${u.id}`, "PATCH", { id: u.id, seesTakings: e.target.checked })} className="accent-[var(--p-brand)]" />
                      Ve lo recaudado
                    </label>
                    <button type="button" disabled={!!busy} onClick={() => confirm(`¿Crear una contraseña nueva para ${u.email}?`) && call(`pw-${u.id}`, "PATCH", { id: u.id, resetPassword: true }, u.email)} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                      Nueva contraseña
                    </button>
                    <button type="button" disabled={!!busy} onClick={() => call(`act-${u.id}`, "PATCH", { id: u.id, active: !u.active })} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                      {u.active ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <Msg msg={msg} />
      </Card>

      <Card title="Añadir usuario" description="Se crea con una contraseña temporal que verás una sola vez.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--p-muted)]">
            Email
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} autoComplete="off" />
          </label>
          <label className="text-xs text-[var(--p-muted)]">
            Nombre (opcional)
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-[var(--p-muted)]">
            Permiso
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={input}>
              <option value="STORE_MANAGER">Pedidos (pedidos y caja)</option>
              <option value="TENANT_ADMIN">Gerente (todo)</option>
            </select>
          </label>
          {form.role === "STORE_MANAGER" && stores.length > 1 && (
            <label className="text-xs text-[var(--p-muted)]">
              Local
              <select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })} className={input}>
                <option value="">Todos los locales</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="button"
          disabled={!!busy || !form.email.trim()}
          onClick={async () => (await call("new", "POST", form, form.email.trim().toLowerCase())) && setForm({ email: "", name: "", role: "STORE_MANAGER", storeId: "" })}
          className={`${primaryBtn} mt-4`}
        >
          {busy === "new" ? "Creando…" : "Añadir usuario"}
        </button>
      </Card>

      <Card title="Mi contraseña" description="Al menos 10 caracteres.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-[var(--p-muted)]">
            Contraseña actual
            <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={input} autoComplete="current-password" />
          </label>
          <label className="text-xs text-[var(--p-muted)]">
            Nueva contraseña
            <input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={input} autoComplete="new-password" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" disabled={!pw.current || pw.next.length < 10} onClick={changePassword} className={primaryBtn}>
            Cambiar contraseña
          </button>
        </div>
      </Card>
    </div>
  );
}
