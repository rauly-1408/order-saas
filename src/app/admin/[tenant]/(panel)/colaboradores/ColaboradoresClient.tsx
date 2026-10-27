"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ask } from "@/app/lib/dialog";
import { Sheet } from "../mesas/shared";

// Colaboradores: RRPP de discotecas, encargados de hoteles, B&B, pubs… Traen
// pedidos con su código o su enlace, se llevan un % de lo que piden (se les paga
// en efectivo a principios de mes) y, si quieres, sus clientes tienen un
// descuento. Ver docs/COLABORADORES.md

type Collaborator = {
  id: string;
  name: string;
  place: string | null;
  phone: string | null;
  code: string;
  commissionPct: number;
  discountPct: number;
  token: string;
  active: boolean;
  notes: string | null;
  orders: number;
  salesCents: number;
  commissionCents: number;
  discountGivenCents: number;
  lastOrderAt: string | null;
  paid: { amountCents: number; paidAt: string } | null;
  pendingBeforeCents: number;
};
type Data = { month: string; currentMonth: string; collaborators: Collaborator[] };
type Form = { id: string | null; name: string; place: string; phone: string; code: string; commissionPct: string; discountPct: string; notes: string };
type Filter = "all" | "active" | "paused" | "unpaid";

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const num = (v: string) => Number(v.replace(",", "."));
const pctText = (n: number) => `${n.toLocaleString("es-ES")} %`;
const monthName = (m: string) => {
  const t = new Date(`${m}-15T12:00:00Z`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const shift = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const codeFrom = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
const waPhone = (p: string | null) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length === 9 && /^[67]/.test(d) ? `34${d}` : d;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
// Color estable por persona (para reconocerla de un vistazo en la lista).
const AVATAR = ["bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];
const avatarOf = (id: string) => AVATAR[[...id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR.length];
function ago(iso: string | null): string {
  if (!iso) return "sin pedidos";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return days <= 0 ? "último pedido hoy" : days === 1 ? "último pedido ayer" : `último pedido hace ${days} días`;
}

const input = "w-full rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]";
const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";
const emptyForm: Form = { id: null, name: "", place: "", phone: "", code: "", commissionPct: "10", discountPct: "0", notes: "" };

export default function ColaboradoresClient({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/colaboradores`;
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${api}${month ? `?month=${month}` : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar los colaboradores");
      setData(json as Data);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los colaboradores");
    }
  }, [api, month]);
  useEffect(() => {
    void load();
  }, [load]);

  const flash = (t: string) => {
    setNotice(t);
    setTimeout(() => setNotice(""), 3500);
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const shopLink = (c: { code: string }) => `${origin}/pedir/${tenant}?c=${c.code}`;
  const privateLink = (c: Collaborator) => `${origin}/colaborador/${c.token}`;

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se ha podido hacer");
    return json;
  }

  const openForm = (c?: Collaborator) => {
    setFormError("");
    setForm(
      c
        ? { id: c.id, name: c.name, place: c.place ?? "", phone: c.phone ?? "", code: c.code, commissionPct: String(c.commissionPct).replace(".", ","), discountPct: String(c.discountPct).replace(".", ","), notes: c.notes ?? "" }
        : emptyForm
    );
  };

  async function save() {
    if (!form) return;
    setSaving(true);
    setFormError("");
    try {
      const body = { name: form.name, place: form.place, phone: form.phone, code: form.code, commissionPct: num(form.commissionPct), discountPct: form.discountPct.trim() ? num(form.discountPct) : 0, notes: form.notes };
      await call(form.id ? `${api}/${form.id}` : api, form.id ? "PATCH" : "POST", body);
      flash(form.id ? "Cambios guardados" : `${form.name} dado de alta. Mándale su enlace por WhatsApp.`);
      setForm(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(c: Collaborator, m: string) {
    if (!(await ask(`¿Marcar como pagados ${euros(c.commissionCents)} a ${c.name}? Corresponde a ${monthName(m).toLowerCase()}.`, { confirm: "Marcar pagado" }))) return;
    try {
      await call(`${api}/${c.id}/pago`, "POST", { month: m });
      flash(`Pago a ${c.name} apuntado`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo apuntar el pago");
    }
  }
  async function undoPaid(c: Collaborator, m: string) {
    if (!(await ask(`¿Quitar el pago de ${monthName(m).toLowerCase()} a ${c.name}? Volverá a salir como pendiente.`, { confirm: "Quitar pago", danger: true }))) return;
    await call(`${api}/${c.id}/pago?month=${m}`, "DELETE").catch(() => null);
    await load();
  }
  async function toggle(c: Collaborator) {
    await call(`${api}/${c.id}`, "PATCH", { active: !c.active }).catch(() => null);
    flash(c.active ? `${c.name} en pausa: su código deja de contar` : `${c.name} activo de nuevo`);
    await load();
  }
  async function remove(c: Collaborator) {
    if (!(await ask(`¿Borrar a ${c.name}? Si ya tiene pedidos, se pone en pausa para no perder su historial.`, { danger: true }))) return;
    const r = await call(`${api}/${c.id}`, "DELETE").catch(() => null);
    flash(r?.deactivated ? `${c.name} tiene pedidos: queda en pausa` : `${c.name} borrado`);
    setForm(null);
    await load();
  }
  async function newLink(c: Collaborator) {
    if (!(await ask(`¿Cambiar el enlace privado de ${c.name}? El anterior dejará de funcionar; tendrás que enviarle el nuevo.`, { confirm: "Cambiar enlace" }))) return;
    await call(`${api}/${c.id}`, "PATCH", { newLink: true }).catch(() => null);
    flash("Enlace privado cambiado. Mándale el nuevo.");
    await load();
  }
  async function copy(text: string, what = "Enlace copiado") {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      flash(text);
    }
  }
  function whatsapp(c: Collaborator) {
    const perk = c.discountPct > 0 ? `\nTus clientes tienen un ${pctText(c.discountPct)} de descuento con tu código.` : "";
    const text = `Hola ${c.name.split(" ")[0]}, este es tu enlace de colaborador:\n\nPara que tus clientes pidan (cuenta para ti): ${shopLink(c)}\nTu código: ${c.code}${perk}\n\nTu app, con lo que llevas ganado al momento: ${privateLink(c)}`;
    window.open(`https://wa.me/${waPhone(c.phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  if (!data) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  const m = data.month;
  const isCurrent = m === data.currentMonth;
  const all = data.collaborators;
  const totals = all.reduce(
    (a, c) => ({ orders: a.orders + c.orders, sales: a.sales + c.salesCents, owed: a.owed + c.commissionCents, discount: a.discount + c.discountGivenCents }),
    { orders: 0, sales: 0, owed: 0, discount: 0 }
  );
  const unpaid = isCurrent ? [] : all.filter((c) => !c.paid && c.commissionCents > 0);
  const unpaidCents = unpaid.reduce((a, c) => a + c.commissionCents, 0);
  const topSales = Math.max(1, ...all.map((c) => c.salesCents));
  const q = query.trim().toLowerCase();
  const shown = all
    .filter((c) => (filter === "active" ? c.active : filter === "paused" ? !c.active : filter === "unpaid" ? !c.paid && c.commissionCents > 0 && !isCurrent : true))
    .filter((c) => !q || [c.name, c.place ?? "", c.code].some((x) => x.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.active) - Number(a.active) || b.salesCents - a.salesCents || a.name.localeCompare(b.name, "es"));

  return (
    <div className="text-[var(--p-ink)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Colaboradores</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--p-muted)]">RRPP, hoteles, B&amp;B, pubs… Te traen pedidos con su código, se llevan su % y sus clientes pueden tener descuento.</p>
        </div>
        <button onClick={() => openForm()} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2.5 text-sm font-semibold text-white">
          + Nuevo colaborador
        </button>
      </div>

      {notice && (
        <p className="fixed inset-x-4 bottom-4 z-[70] mx-auto w-fit max-w-[calc(100%-2rem)] rounded-2xl bg-[var(--p-ink)] px-4 py-3 text-sm font-medium text-white shadow-lg" role="status">
          {notice}
        </p>
      )}
      {error && <p className="mt-4 rounded-xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p>}

      {all.length === 0 ? (
        <EmptyState onNew={() => openForm()} />
      ) : (
        <>
          {/* Mes y resumen */}
          <div className="mt-6 flex items-center gap-1">
            <button onClick={() => setMonth(shift(m, -1))} aria-label="Mes anterior" className="p-press grid h-9 w-9 place-items-center rounded-full bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <Chevron dir="left" />
            </button>
            <span className="min-w-36 text-center text-sm font-semibold">{monthName(m)}</span>
            <button onClick={() => setMonth(shift(m, 1))} disabled={isCurrent} aria-label="Mes siguiente" className="p-press grid h-9 w-9 place-items-center rounded-full bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.06)] disabled:opacity-30">
              <Chevron dir="right" />
            </button>
            {!isCurrent && (
              <button onClick={() => setMonth(data.currentMonth)} className="ml-1 rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--p-brand)] hover:bg-[var(--p-brand-soft)]">
                Este mes
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Ventas que te traen" value={euros(totals.sales)} sub={`${totals.orders} ${totals.orders === 1 ? "pedido" : "pedidos"}`} />
            <Kpi label={isCurrent ? "Llevan ganado" : "Comisiones del mes"} value={euros(totals.owed)} sub={isCurrent ? `se paga a principios de ${monthName(shift(m, 1)).split(" ")[0].toLowerCase()}` : unpaid.length ? `${unpaid.length} sin pagar` : "todo pagado"} tone={!isCurrent && unpaid.length ? "warn" : undefined} />
            <Kpi label="Descuento a sus clientes" value={euros(totals.discount)} sub="lo que se han ahorrado" />
            <Kpi label="Colaboradores" value={String(all.filter((c) => c.active).length)} sub={`${all.filter((c) => !c.active).length} en pausa`} />
          </div>

          {unpaid.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                Tienes <span className="font-semibold">{unpaid.length} {unpaid.length === 1 ? "pago pendiente" : "pagos pendientes"}</span> de {monthName(m).toLowerCase()}: {euros(unpaidCents)}.
              </span>
              <button onClick={() => setFilter("unpaid")} className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold">
                Ver quién
              </button>
            </div>
          )}

          {/* Filtros */}
          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {(
              [
                ["all", `Todos (${all.length})`],
                ["active", "Activos"],
                ["paused", "En pausa"],
                ...(isCurrent ? [] : ([["unpaid", "Por pagar"]] as const)),
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${filter === k ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)] text-[var(--p-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:text-[var(--p-ink)]"}`}>
                {l}
              </button>
            ))}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, sitio o código…" aria-label="Buscar colaborador" className="w-full rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2 text-sm outline-none focus:border-[var(--p-brand)] sm:ml-auto sm:w-64" />
          </div>

          {shown.length === 0 ? (
            <p className="mt-6 text-center text-sm text-[var(--p-muted)]">Nadie por aquí.</p>
          ) : (
            <ul className="mt-4 grid gap-3 xl:grid-cols-2">
              {shown.map((c) => (
                <li key={c.id} className={`flex flex-col rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5 ${c.active ? "" : "opacity-70"}`}>
                  <div className="flex items-start gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ${avatarOf(c.id)}`} aria-hidden>
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span className="truncate">{c.name}</span>
                        {!c.active && <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-muted)]">En pausa</span>}
                      </p>
                      <p className="truncate text-xs text-[var(--p-muted)]">{c.place || "Sin sitio"}</p>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <p className="text-xl font-semibold">{euros(c.commissionCents)}</p>
                      <p className="text-[11px] text-[var(--p-muted)]">{isCurrent ? "lleva ganado" : "comisión"}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button onClick={() => copy(shopLink(c), `Enlace de ${c.name.split(" ")[0]} copiado`)} title="Copiar su enlace de la tienda" className="flex items-center gap-1 rounded-full bg-[var(--p-bg)] px-2.5 py-1 text-xs font-bold tracking-wider hover:bg-black/[0.06]">
                      {c.code}
                      <CopyIcon />
                    </button>
                    <span className="rounded-full bg-[var(--p-brand-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--p-brand-strong)]">Se lleva {pctText(c.commissionPct)}</span>
                    {c.discountPct > 0 ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Cliente −{pctText(c.discountPct)}</span>
                    ) : (
                      <span className="rounded-full bg-[var(--p-bg)] px-2.5 py-1 text-xs text-[var(--p-muted)]">Sin descuento al cliente</span>
                    )}
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between gap-2 text-xs text-[var(--p-muted)] tabular-nums">
                      <span>
                        {c.orders} {c.orders === 1 ? "pedido" : "pedidos"} · {euros(c.salesCents)}
                      </span>
                      <span>{ago(c.lastOrderAt)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/[0.05]" aria-hidden>
                      <div className="h-full rounded-full bg-[var(--p-brand)]" style={{ width: `${(c.salesCents / topSales) * 100}%` }} />
                    </div>
                  </div>

                  {/* Pago del mes */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {isCurrent ? null : c.paid ? (
                      <>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          ✓ Pagado {euros(c.paid.amountCents)} el {new Date(c.paid.paidAt).toLocaleDateString("es-ES")}
                        </span>
                        <button onClick={() => undoPaid(c, m)} className="text-xs text-[var(--p-muted)] underline">
                          Deshacer
                        </button>
                      </>
                    ) : c.commissionCents > 0 ? (
                      <button onClick={() => markPaid(c, m)} className="p-press rounded-full bg-[var(--p-ink)] px-4 py-2 text-sm font-semibold text-white">
                        Marcar pagado {euros(c.commissionCents)}
                      </button>
                    ) : null}
                    {c.pendingBeforeCents > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Le debes {euros(c.pendingBeforeCents)} de meses anteriores</span>}
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--p-line)] pt-3 [&:not(:first-child)]:mt-3">
                    <button onClick={() => whatsapp(c)} className="p-press flex items-center gap-1.5 rounded-full bg-[#25d366] px-3.5 py-2 text-xs font-semibold text-white">
                      <WhatsAppIcon />
                      Enviar su enlace
                    </button>
                    <button onClick={() => openForm(c)} className="rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold hover:bg-black/[0.08]">
                      Editar
                    </button>
                    <Menu
                      items={[
                        { label: "Ver su app", href: privateLink(c) },
                        { label: "Tarjetas VIP para imprimir", href: `${privateLink(c)}/tarjetas` },
                        { label: "Copiar enlace de la tienda", onClick: () => copy(shopLink(c)) },
                        { label: "Copiar enlace de su app", onClick: () => copy(privateLink(c)) },
                        { label: c.active ? "Pausar su código" : "Activar su código", onClick: () => toggle(c) },
                        { label: "Cambiar enlace privado", onClick: () => newLink(c) },
                        { label: "Borrar", onClick: () => remove(c), danger: true },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {form && <CollabSheet form={form} setForm={setForm} tenant={tenant} origin={origin} saving={saving} error={formError} onSave={save} onClose={() => setForm(null)} onRemove={form.id ? () => { const c = all.find((x) => x.id === form.id); if (c) void remove(c); } : undefined} />}
    </div>
  );
}

// Alta / edición en una hoja: quién es, su código y sus condiciones, con un
// ejemplo en vivo de lo que paga el cliente y lo que se lleva.
function CollabSheet({ form, setForm, tenant, origin, saving, error, onSave, onClose, onRemove }: { form: Form; setForm: (f: Form) => void; tenant: string; origin: string; saving: boolean; error: string; onSave: () => void; onClose: () => void; onRemove?: () => void }) {
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const commission = num(form.commissionPct) || 0;
  const discount = form.discountPct.trim() ? num(form.discountPct) || 0 : 0;
  const example = 3000;
  const off = Math.round((example * discount) / 100);
  const earns = Math.round(((example - off) * commission) / 100);
  const first = form.name.trim().split(" ")[0] || "El colaborador";
  return (
    <Sheet
      title={form.id ? `Editar a ${form.name}` : "Nuevo colaborador"}
      onClose={onClose}
      footer={
        <>
          {error && <p className="mb-2 text-sm text-[var(--p-accent)]">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSave} disabled={saving || !form.name.trim()} className="p-press flex-1 rounded-2xl bg-[var(--p-brand)] py-3 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : form.id ? "Guardar cambios" : "Dar de alta"}
            </button>
            {onRemove && (
              <button type="button" onClick={onRemove} className="rounded-2xl px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50">
                Borrar
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-5 px-5 pb-2">
        <fieldset className="space-y-3">
          <legend className="mb-2 text-xs font-semibold tracking-wide text-[var(--p-muted)] uppercase">Quién es</legend>
          <label className="block">
            <span className={label}>Nombre</span>
            <input autoFocus value={form.name} onChange={(e) => set({ name: e.target.value, code: form.id || form.code !== codeFrom(form.name) ? form.code : codeFrom(e.target.value) })} placeholder="Laura García" className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Dónde trabaja</span>
              <input value={form.place} onChange={(e) => set({ place: e.target.value })} placeholder="Hotel Alhambra" className={input} />
            </label>
            <label className="block">
              <span className={label}>Teléfono (WhatsApp)</span>
              <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} inputMode="tel" placeholder="600 000 000" className={input} />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-[var(--p-muted)] uppercase">Su código</legend>
          <input value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })} placeholder="LAURA" aria-label="Código" className={`${input} text-base font-bold tracking-widest`} />
          <p className="mt-1.5 truncate text-xs text-[var(--p-muted)]">
            Su enlace: {origin}/pedir/{tenant}?c={form.code || "CODIGO"}
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-[var(--p-muted)] uppercase">Condiciones</legend>
          <div className="grid grid-cols-2 gap-3">
            <PctInput label="Se lleva (comisión)" value={form.commissionPct} onChange={(v) => set({ commissionPct: v })} />
            <PctInput label="Descuento a sus clientes" value={form.discountPct} onChange={(v) => set({ discountPct: v })} hint="0 = sin descuento" />
          </div>
          <div className="mt-3 rounded-2xl bg-[var(--p-bg)] p-3 text-sm">
            <p className="text-xs font-semibold text-[var(--p-muted)]">Ejemplo con un pedido de {euros(example)}</p>
            <div className="mt-1.5 flex justify-between tabular-nums">
              <span>El cliente paga</span>
              <span className="font-semibold">
                {euros(example - off)}
                {off > 0 && <span className="ml-1 font-normal text-emerald-700">(−{euros(off)})</span>}
              </span>
            </div>
            <div className="flex justify-between tabular-nums">
              <span>{first} se lleva</span>
              <span className="font-semibold">{euros(earns)}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--p-muted)]">La comisión va sobre lo que paga el cliente por la comida (sin envío ni propina). Los cancelados no cuentan. El descuento no se suma a promociones ni cupones: se aplica el que más ahorre.</p>
        </fieldset>

        <label className="block">
          <span className={label}>Notas (solo las ves tú)</span>
          <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} placeholder="Trabaja de jueves a sábado…" className={input} />
        </label>
      </div>
    </Sheet>
  );
}

function PctInput({ label: text, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className={label}>{text}</span>
      <span className="flex items-center gap-1.5">
        <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9,.]/g, "").slice(0, 5))} inputMode="decimal" className={`${input} text-lg font-semibold`} />
        <span className="text-sm text-[var(--p-muted)]">%</span>
      </span>
      {hint && <span className="mt-1 block text-[11px] text-[var(--p-muted)]">{hint}</span>}
    </label>
  );
}

function Kpi({ label: text, value, sub, tone }: { label: string; value: string; sub: string; tone?: "warn" }) {
  return (
    <div className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-xs text-[var(--p-muted)]">{text}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      <p className={`text-[11px] ${tone === "warn" ? "font-semibold text-amber-700" : "text-[var(--p-muted)]"}`}>{sub}</p>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  const steps = [
    ["Dale de alta", "Nombre, dónde trabaja, su % y, si quieres, un descuento para sus clientes."],
    ["Mándale su enlace", "Por WhatsApp: su enlace de la tienda, su código y su app para ver lo que gana."],
    ["Págale a principios de mes", "Aquí verás lo que ha traído y lo que le debes. Lo marcas como pagado y listo."],
  ];
  return (
    <div className="mt-6 rounded-3xl bg-[var(--p-surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-8">
      <p className="text-lg font-semibold">Gente que te trae clientes</p>
      <p className="mt-1 max-w-lg text-sm text-[var(--p-muted)]">La RRPP de una discoteca, el recepcionista de un hotel, el dueño de un B&amp;B… Cada pedido con su código le suma su %.</p>
      <ol className="mt-5 grid gap-3 sm:grid-cols-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="rounded-2xl bg-[var(--p-bg)] p-4">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--p-brand)] text-xs font-bold text-white">{i + 1}</span>
            <p className="mt-2 text-sm font-semibold">{t}</p>
            <p className="mt-0.5 text-xs text-[var(--p-muted)]">{d}</p>
          </li>
        ))}
      </ol>
      <button onClick={onNew} className="p-press mt-6 rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white">
        + Dar de alta al primero
      </button>
    </div>
  );
}

// Menú «Más» con las acciones que se usan menos.
function Menu({ items }: { items: { label: string; href?: string; onClick?: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative ml-auto">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold hover:bg-black/[0.08]">
        Más ···
      </button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full z-30 mb-2 w-60 overflow-hidden rounded-2xl bg-[var(--p-surface)] py-1 shadow-[0_12px_32px_-8px_rgba(0,0,0,0.3)] ring-1 ring-black/5">
          {items.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" href={it.href} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-sm hover:bg-[var(--p-bg)]">
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
                className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--p-bg)] ${it.danger ? "text-red-600" : ""}`}
              >
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
    <path d={dir === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CopyIcon = () => (
  <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 opacity-60" aria-hidden>
    <rect x="7" y="7" width="9" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M13 4.5H6A1.5 1.5 0 0 0 4.5 6v7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
    <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.2-.2-.2-.4-.3Z" />
  </svg>
);
