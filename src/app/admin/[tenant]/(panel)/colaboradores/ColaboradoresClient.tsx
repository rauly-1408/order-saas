"use client";

import { useCallback, useEffect, useState } from "react";
import { ask } from "@/app/lib/dialog";

// Colaboradores: RRPP de discotecas, encargados de hoteles, B&B, pubs… Traen
// pedidos con su código o su enlace y se llevan un % de lo que piden, que se les
// paga en efectivo a principios de mes. Ver docs/COLABORADORES.md

type Collaborator = {
  id: string;
  name: string;
  place: string | null;
  phone: string | null;
  code: string;
  commissionPct: number;
  token: string;
  active: boolean;
  notes: string | null;
  orders: number;
  salesCents: number;
  commissionCents: number;
  paid: { amountCents: number; paidAt: string } | null;
  pendingBeforeCents: number;
};
type Data = { month: string; currentMonth: string; collaborators: Collaborator[] };
type Form = { id: string | null; name: string; place: string; phone: string; code: string; commissionPct: string; notes: string };

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
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
const input = "w-full rounded-lg border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]";
const label = "mb-1 block text-[13px] font-medium text-[var(--p-muted)]";

export default function ColaboradoresClient({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/colaboradores`;
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

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
    setTimeout(() => setNotice(""), 4000);
  };
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const shopLink = (c: Collaborator) => `${origin}/pedir/${tenant}?c=${c.code}`;
  const privateLink = (c: Collaborator) => `${origin}/colaborador/${c.token}`;

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se ha podido hacer");
    return json;
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const body = { name: form.name, place: form.place, phone: form.phone, code: form.code, commissionPct: Number(form.commissionPct.replace(",", ".")), notes: form.notes };
      await call(form.id ? `${api}/${form.id}` : api, form.id ? "PATCH" : "POST", body);
      setForm(null);
      flash(form.id ? "Cambios guardados" : `${form.name} dado de alta. Envíale su enlace por WhatsApp.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
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
    if (!(await ask(`¿Borrar a ${c.name}? Si ya tiene pedidos, se pone en pausa para no perder su historial.`))) return;
    const r = await call(`${api}/${c.id}`, "DELETE").catch(() => null);
    flash(r?.deactivated ? `${c.name} tiene pedidos: queda en pausa` : `${c.name} borrado`);
    setForm(null);
    await load();
  }
  async function newLink(c: Collaborator) {
    if (!(await ask(`¿Cambiar el enlace privado de ${c.name}? El anterior dejará de funcionar; tendrás que enviarle el nuevo.`, { confirm: "Cambiar enlace" }))) return;
    await call(`${api}/${c.id}`, "PATCH", { newLink: true }).catch(() => null);
    await load();
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flash("Enlace copiado");
    } catch {
      flash(text);
    }
  }
  function whatsapp(c: Collaborator) {
    const text = `Hola ${c.name.split(" ")[0]}, este es tu enlace de colaborador:\n\nPara que tus clientes pidan (cuenta para ti): ${shopLink(c)}\nTu código: ${c.code}\n\nAquí ves lo que llevas ganado: ${privateLink(c)}`;
    window.open(`https://wa.me/${waPhone(c.phone)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  }

  if (!data) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  const m = data.month;
  const isCurrent = m === data.currentMonth;
  const totals = data.collaborators.reduce((a, c) => ({ orders: a.orders + c.orders, sales: a.sales + c.salesCents, owed: a.owed + c.commissionCents }), { orders: 0, sales: 0, owed: 0 });

  return (
    <div className="text-[var(--p-ink)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Colaboradores</h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--p-muted)]">
            Gente que te trae pedidos (RRPP, hoteles, B&amp;B, pubs…). Pide con su código o su enlace, se lleva un % de lo que pidan y se le paga en efectivo a principios de mes.
          </p>
        </div>
        {!form && (
          <button onClick={() => setForm({ id: null, name: "", place: "", phone: "", code: "", commissionPct: "10", notes: "" })} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2.5 text-sm font-semibold text-white">
            + Nuevo colaborador
          </button>
        )}
      </div>

      {notice && <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {error && <p className="mt-4 rounded-xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p>}

      {form && (
        <div className="mt-5 rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
          <h2 className="text-[17px] font-semibold">{form.id ? `Editar a ${form.name}` : "Nuevo colaborador"}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Nombre</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, code: form.id || form.code !== codeFrom(form.name) ? form.code : codeFrom(e.target.value) })} placeholder="Laura" className={input} />
            </label>
            <label className="block">
              <span className={label}>Dónde trabaja</span>
              <input value={form.place} onChange={(e) => setForm({ ...form, place: e.target.value })} placeholder="Pub La Charca, Hotel Alhambra…" className={input} />
            </label>
            <label className="block">
              <span className={label}>Teléfono (para mandarle su enlace por WhatsApp)</span>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="600 000 000" className={input} />
            </label>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <label className="block">
                <span className={label}>Su código</span>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) })} placeholder="LAURA" className={`${input} font-semibold tracking-wider`} />
              </label>
              <label className="block">
                <span className={label}>Se lleva</span>
                <span className="flex items-center gap-1">
                  <input value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} inputMode="decimal" className={input} />
                  <span className="text-sm text-[var(--p-muted)]">%</span>
                </span>
              </label>
            </div>
            <label className="block sm:col-span-2">
              <span className={label}>Notas (solo las ves tú)</span>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Trabaja jueves a sábado…" className={input} />
            </label>
          </div>
          <p className="mt-3 text-xs text-[var(--p-muted)]">Se lleva su % de lo que pidan con su código (sin contar el envío ni la propina). Los pedidos cancelados no cuentan.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={save} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button onClick={() => setForm(null)} className="rounded-full px-4 py-2 text-sm text-[var(--p-muted)] hover:bg-black/[0.04]">
              Cancelar
            </button>
            {form.id && (
              <button
                onClick={() => {
                  const c = data.collaborators.find((x) => x.id === form.id);
                  if (c) void remove(c);
                }}
                className="ml-auto rounded-full px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Borrar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mes */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setMonth(shift(m, -1))} aria-label="Mes anterior" className="p-press h-10 w-10 rounded-full bg-[var(--p-surface)] text-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            ‹
          </button>
          <span className="min-w-36 text-center text-sm font-semibold">{monthName(m)}</span>
          <button onClick={() => setMonth(shift(m, 1))} disabled={isCurrent} aria-label="Mes siguiente" className="p-press h-10 w-10 rounded-full bg-[var(--p-surface)] text-lg shadow-[0_1px_2px_rgba(0,0,0,0.05)] disabled:opacity-30">
            ›
          </button>
        </div>
        <p className="text-right text-sm text-[var(--p-muted)] tabular-nums">
          {totals.orders} {totals.orders === 1 ? "pedido" : "pedidos"} · {euros(totals.sales)}
          <span className="block font-semibold text-[var(--p-ink)]">{isCurrent ? "Llevan" : "A pagar"}: {euros(totals.owed)}</span>
        </p>
      </div>

      {data.collaborators.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center text-sm text-[var(--p-muted)]">
          Aún no tienes colaboradores. Da de alta a la RRPP de una discoteca o al encargado de un hotel y mándale su enlace: cada pedido que traiga le suma su %.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.collaborators.map((c) => (
            <li key={c.id} className={`rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${c.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {c.name}
                    {!c.active && <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-muted)]">En pausa</span>}
                  </p>
                  <p className="text-xs text-[var(--p-muted)]">
                    {c.place ? `${c.place} · ` : ""}código <span className="font-semibold tracking-wider text-[var(--p-ink)]">{c.code}</span> · {c.commissionPct.toLocaleString("es-ES")} %
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-xl font-semibold">{euros(c.commissionCents)}</p>
                  <p className="text-xs text-[var(--p-muted)]">
                    {c.orders} {c.orders === 1 ? "pedido" : "pedidos"} · {euros(c.salesCents)}
                  </p>
                </div>
              </div>

              {/* Pago del mes */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {isCurrent ? (
                  <span className="text-[var(--p-muted)]">Se le paga a principios de {monthName(shift(m, 1)).toLowerCase()}.</span>
                ) : c.paid ? (
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
                ) : (
                  <span className="text-[var(--p-muted)]">Sin pedidos este mes.</span>
                )}
                {c.pendingBeforeCents > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Le debes {euros(c.pendingBeforeCents)} de meses anteriores</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--p-line)] pt-3">
                <button onClick={() => whatsapp(c)} className="p-press rounded-full bg-[#25d366] px-3.5 py-2 text-xs font-semibold text-white">
                  Mandarle su enlace por WhatsApp
                </button>
                <button onClick={() => copy(shopLink(c))} className="rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold">
                  Copiar enlace de la tienda
                </button>
                <a href={privateLink(c)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold">
                  Ver su página (QR)
                </a>
                <a href={`${privateLink(c)}/tarjetas`} target="_blank" rel="noopener noreferrer" className="rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold">
                  Tarjetas VIP para imprimir
                </a>
                <button onClick={() => setForm({ id: c.id, name: c.name, place: c.place ?? "", phone: c.phone ?? "", code: c.code, commissionPct: String(c.commissionPct).replace(".", ","), notes: c.notes ?? "" })} className="rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold">
                  Editar
                </button>
                <button onClick={() => toggle(c)} className="rounded-full bg-black/[0.05] px-3.5 py-2 text-xs font-semibold">
                  {c.active ? "Pausar" : "Activar"}
                </button>
                <button onClick={() => newLink(c)} className="rounded-full px-3.5 py-2 text-xs text-[var(--p-muted)] underline">
                  Cambiar enlace privado
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
