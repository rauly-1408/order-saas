"use client";

import { ask } from "@/app/lib/dialog";
import { useEffect, useState } from "react";
import { PUESTOS, puestoOf, type Puesto } from "@/app/lib/roles";
import { Card, Msg, Toggle, ghostBtn, input, primaryBtn, toast } from "../ui";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  position: string | null;
  canCharge: boolean;
  stationCategoryIds: string[];
  active: boolean;
  storeId: string | null;
  seesTakings: boolean;
  lastLoginAt: string | null;
  me: boolean;
};
type Store = { id: string; name: string };
type Category = { id: string; name: string };

const isStation = (p: Puesto) => p === "COCINA" || p === "BARRA";
const puestoName = (p: Puesto) => PUESTOS.find((x) => x.key === p)!.label;

// Qué ve cada puesto (la misma regla que lib/roles.ts → accessOf).
const MATRIX: { label: string; on: Puesto[] }[] = [
  { label: "Caja", on: ["GERENTE", "ENCARGADO", "CAJA"] },
  { label: "Pedidos", on: ["GERENTE", "ENCARGADO", "CAJA", "CAMARERO", "COCINA", "BARRA"] },
  { label: "Mesas", on: ["GERENTE", "ENCARGADO", "CAJA", "CAMARERO"] },
  { label: "Cobrar", on: ["GERENTE", "ENCARGADO", "CAJA", "CAMARERO"] },
  { label: "Facturas", on: ["GERENTE", "ENCARGADO", "CAJA"] },
  { label: "Anular y cerrar sin cobrar", on: ["GERENTE", "ENCARGADO"] },
  { label: "Carta, costes, clientes y configuración", on: ["GERENTE"] },
];

// Secciones de la carta que ve cocina o barra.
function Sections({ categories, value, onChange, disabled }: { categories: Category[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  if (!categories.length) return <p className="text-xs text-[var(--p-muted)]">Todavía no hay secciones en la carta.</p>;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Secciones de la carta">
      {categories.map((c) => {
        const on = value.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id])}
            className={`p-press min-h-9 rounded-full px-3 text-xs font-semibold ${on ? "bg-[var(--p-ink)] text-white" : "bg-black/[0.05] text-[var(--p-muted)]"}`}
          >
            {on ? "✓ " : ""}
            {c.name}
          </button>
        );
      })}
    </div>
  );
}

// Usuarios y permisos: cada persona con su puesto (gerente, encargado, caja,
// camarero, cocina o barra), de un local o de todos. Ver docs/USUARIOS-Y-PUESTOS.md
export default function Usuarios({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/users`;
  const [users, setUsers] = useState<User[] | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const empty = { email: "", name: "", puesto: "CAMARERO" as Puesto, storeId: "", canCharge: true, stationCategoryIds: null as string[] | null };
  const [form, setForm] = useState(empty);
  const [edit, setEdit] = useState<string | null>(null); // usuario desplegado para editar
  const [adding, setAdding] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false); // la tabla de permisos, plegada
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
        setCategories(d.categories ?? []);
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
  const sectionNames = (ids: string[]) => categories.filter((c) => ids.includes(c.id)).map((c) => c.name);
  const formHint = PUESTOS.find((p) => p.key === form.puesto)!.hint;

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

      <Card title="Usuarios" description="Cada persona entra con su puesto y solo ve lo suyo. Ventas, informes y lo recaudado solo los ve quien tenga activado «Ve lo recaudado».">
        {!users ? (
          <p className="text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : (
          <ul className="-mx-2 divide-y divide-[var(--p-line)]">
            {users.map((u) => {
              const puesto = puestoOf(u);
              const editing = edit === u.id;
              const title = u.name || u.email.split("@")[0];
              const meta = [
                u.role === "STORE_MANAGER" && stores.length > 1 ? storeName(u.storeId) : null,
                puesto === "CAMARERO" ? (u.canCharge ? "Puede cobrar" : "No cobra") : null,
                isStation(puesto) ? `Ve: ${sectionNames(u.stationCategoryIds).join(", ") || "ninguna sección"}` : null,
                u.seesTakings ? "Ve lo recaudado" : null,
                u.lastLoginAt ? `Última entrada ${new Date(u.lastLoginAt).toLocaleDateString("es-ES")}` : "Nunca ha entrado",
              ].filter(Boolean);
              return (
                <li key={u.id} className={`px-2 py-3 ${u.active ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--p-brand-soft)] text-sm font-semibold text-[var(--p-brand)]">
                      {title.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-semibold">
                        <span className="truncate">{title}</span>
                        {u.me && <span className="text-sm font-normal text-[var(--p-muted)]">(tú)</span>}
                        <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-ink)]">{puestoName(puesto)}</span>
                        {!u.active && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">Desactivado</span>}
                      </p>
                      <p className="truncate text-xs text-[var(--p-muted)]">{u.email}</p>
                      <p className="line-clamp-2 text-xs text-[var(--p-muted)]">{meta.join(" · ")}</p>
                    </div>
                    {u.me ? (
                      <a href="#mi-contrasena" className="shrink-0 text-xs font-semibold text-[var(--p-muted)] hover:text-[var(--p-ink)]">
                        Mi contraseña
                      </a>
                    ) : (
                      <button type="button" onClick={() => setEdit(editing ? null : u.id)} aria-expanded={editing} className={`${ghostBtn} !min-h-10 shrink-0 !px-4 !py-0 text-sm`}>
                        {editing ? "Cerrar" : "Editar"}
                      </button>
                    )}
                  </div>

                  {editing && (
                    <div className="mt-3 rounded-2xl bg-[var(--p-bg)] p-4 sm:ml-[52px]">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-xs text-[var(--p-muted)]">
                          Puesto
                          <select value={puesto} onChange={(e) => call(`puesto-${u.id}`, "PATCH", { id: u.id, puesto: e.target.value })} disabled={!!busy} className={`${input} bg-[var(--p-surface)]`}>
                            {PUESTOS.map((p) => (
                              <option key={p.key} value={p.key}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {u.role === "STORE_MANAGER" && stores.length > 1 && (
                          <label className="text-xs text-[var(--p-muted)]">
                            Local
                            <select value={u.storeId ?? ""} onChange={(e) => call(`store-${u.id}`, "PATCH", { id: u.id, storeId: e.target.value })} disabled={!!busy} className={`${input} bg-[var(--p-surface)]`}>
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
                      <p className="mt-2 text-xs text-[var(--p-muted)]">{PUESTOS.find((p) => p.key === puesto)!.hint}</p>
                      <div className="mt-2 divide-y divide-[var(--p-line)]">
                        {puesto === "CAMARERO" && <Toggle checked={u.canCharge} onChange={(v) => !busy && call(`charge-${u.id}`, "PATCH", { id: u.id, canCharge: v })} label="Puede cobrar" hint="Cobra las mesas y los pedidos al entregarlos." />}
                        <Toggle checked={u.seesTakings} onChange={(v) => !busy && call(`takings-${u.id}`, "PATCH", { id: u.id, seesTakings: v })} label="Ve lo recaudado" hint="Ventas del día, informes y caja." />
                      </div>
                      {isStation(puesto) && (
                        <div className="mt-2">
                          <p className="mb-2 text-xs text-[var(--p-muted)]">Secciones de la carta que {puesto === "COCINA" ? "cocina" : "barra"} ve en Pedidos:</p>
                          <Sections categories={categories} value={u.stationCategoryIds} disabled={!!busy} onChange={(ids) => call(`sec-${u.id}`, "PATCH", { id: u.id, stationCategoryIds: ids })} />
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--p-line)] pt-3">
                        <button type="button" disabled={!!busy} onClick={async () => (await ask(`¿Crear una contraseña nueva para ${u.email}?`)) && call(`pw-${u.id}`, "PATCH", { id: u.id, resetPassword: true }, u.email)} className={`${ghostBtn} !min-h-10 !px-4 !py-0 text-sm`}>
                          Nueva contraseña
                        </button>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={async () => (u.active ? await ask(`¿Desactivar a ${u.email}? No podrá entrar hasta que lo vuelvas a activar.`, { confirm: "Desactivar", danger: true }) : true) && call(`act-${u.id}`, "PATCH", { id: u.id, active: !u.active })}
                          className={`p-press min-h-10 rounded-full px-4 text-sm font-semibold ${u.active ? "text-red-600 hover:bg-red-50" : "bg-[var(--p-brand)] text-white"}`}
                        >
                          {u.active ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Msg msg={msg} />

        {/* Añadir: plegado, como en Shopify */}
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className={`${primaryBtn} mt-4`}>
            + Añadir usuario
          </button>
        ) : (
          <div className="mt-4 rounded-2xl border border-[var(--p-line)] p-4">
            <p className="text-[15px] font-semibold">Nuevo usuario</p>
            <p className="text-xs text-[var(--p-muted)]">Se crea con una contraseña temporal que verás una sola vez.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--p-muted)]">
                Email
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} autoComplete="off" placeholder="nombre@ejemplo.com" />
              </label>
              <label className="text-xs text-[var(--p-muted)]">
                Nombre (opcional)
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder="Como lo llamáis en el local" />
              </label>
              <label className="text-xs text-[var(--p-muted)]">
                Puesto
                <select value={form.puesto} onChange={(e) => setForm({ ...form, puesto: e.target.value as Puesto, stationCategoryIds: null })} className={input}>
                  {PUESTOS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              {form.puesto !== "GERENTE" && stores.length > 1 && (
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
            <p className="mt-2 text-xs text-[var(--p-muted)]">{formHint}</p>
            {form.puesto === "CAMARERO" && <Toggle checked={form.canCharge} onChange={(v) => setForm({ ...form, canCharge: v })} label="Puede cobrar las mesas" />}
            {isStation(form.puesto) && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-[var(--p-muted)]">Secciones que verá en Pedidos. Si no tocas nada, {form.puesto === "BARRA" ? "barra ve las bebidas" : "cocina ve todo menos las bebidas"}.</p>
                {form.stationCategoryIds ? (
                  <Sections categories={categories} value={form.stationCategoryIds} onChange={(ids) => setForm({ ...form, stationCategoryIds: ids })} />
                ) : (
                  <button type="button" onClick={() => setForm({ ...form, stationCategoryIds: [] })} className={`${ghostBtn} !px-3 !py-1.5 text-xs`}>
                    Elegir secciones
                  </button>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!!busy || !form.email.trim()}
                onClick={async () => {
                  const body = { email: form.email, name: form.name, puesto: form.puesto, storeId: form.storeId, canCharge: form.canCharge, ...(form.stationCategoryIds && { stationCategoryIds: form.stationCategoryIds }) };
                  if (await call("new", "POST", body, form.email.trim().toLowerCase())) {
                    setForm(empty);
                    setAdding(false);
                  }
                }}
                className={primaryBtn}
              >
                {busy === "new" ? "Creando…" : "Crear usuario"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(empty);
                  setAdding(false);
                }}
                className={ghostBtn}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card title="Qué ve cada puesto" description="Así se reparten las tareas. El gerente puede cambiar el puesto de cualquiera cuando quiera, y vale al momento.">
        <button type="button" onClick={() => setShowMatrix((v) => !v)} aria-expanded={showMatrix} className={`${ghostBtn} !min-h-10 !px-4 !py-0 text-sm`}>
          {showMatrix ? "Ocultar la tabla" : "Ver la tabla de permisos"}
        </button>
        {showMatrix && (
        <>
        <div className="-mx-1 mt-3 overflow-x-auto px-1">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--p-muted)]">
                <th className="py-2 pr-3 font-semibold"> </th>
                {PUESTOS.map((p) => (
                  <th key={p.key} className="px-2 py-2 text-center font-semibold">
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--p-line)]">
              {MATRIX.map((row) => (
                <tr key={row.label}>
                  <td className="py-2 pr-3">{row.label}</td>
                  {PUESTOS.map((p) => (
                    <td key={p.key} className="px-2 py-2 text-center" aria-label={row.on.includes(p.key) ? "Sí" : "No"}>
                      {row.on.includes(p.key) ? <span className="font-bold text-emerald-700">✓</span> : <span className="text-[var(--p-muted)]">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[var(--p-muted)]">Cocina y barra solo ven las líneas de sus secciones y solo pueden marcar «preparando» y «listo». El camarero cobra si tiene marcado «Puede cobrar».</p>
        </>
        )}
      </Card>

      <div id="mi-contrasena" className="scroll-mt-24">
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
    </div>
  );
}
