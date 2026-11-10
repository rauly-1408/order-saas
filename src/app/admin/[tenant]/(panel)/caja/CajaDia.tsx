"use client";

import { useCallback, useEffect, useState } from "react";
import type { HoyOrder, HoyPayment, HoyResponse } from "@/app/api/admin/[tenant]/caja/hoy/route";
import { ask } from "@/app/lib/dialog";
import { BTN } from "../buttons";

// «Hoy en caja»: lo vendido en el día (y en días anteriores con ‹ ›). Cada
// ticket se abre para ver qué se cobró, reimprimirlo o cambiar la forma de pago
// (dijo tarjeta y pagó en efectivo o Bizum). Ver docs/CAJA.md
const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const PAY: Record<HoyPayment, string> = { CASH: "Efectivo", CARD_TERMINAL: "Datáfono", BIZUM: "Bizum", CARD: "Tarjeta online", IN_STORE: "Al recoger" };
const STATUS: Record<string, string> = { OPEN: "Mesa abierta", CREATED: "Nuevo", PAID: "Nuevo", SENT_TO_POS: "Nuevo", ACCEPTED: "Preparando", PREPARING: "Preparando", READY: "Listo", DELIVERING: "En reparto", DELIVERED: "Entregado", CANCELLED: "Cancelado" };
const CHANGEABLE: HoyPayment[] = ["CASH", "CARD_TERMINAL", "BIZUM"];
const shiftDay = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
type Detail = { lines: { id: string; name: string; quantity: number; totalCents: number; modifiers: string[]; note: string | null }[]; invoiceNumber: string | null };

export default function CajaDia({ tenant, onClose, onChanged }: { tenant: string; onClose: () => void; onChanged: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [data, setData] = useState<HoyResponse | null>(null);
  const [ticket, setTicket] = useState<HoyOrder | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/${tenant}/caja/hoy${date ? `?fecha=${date}` : ""}`, { cache: "no-store" });
    const d = r.ok ? ((await r.json()) as HoyResponse) : null;
    setData(d);
    return d;
  }, [tenant, date]);
  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/${tenant}/caja/hoy${date ? `?fecha=${date}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tenant, date]);

  async function open(o: HoyOrder) {
    setTicket(o);
    setDetail(null);
    setMsg(null);
    const r = await fetch(`/api/admin/${tenant}/caja/ticket/${o.id}`, { cache: "no-store" });
    if (r.ok) setDetail(await r.json());
  }

  async function changeMethod(o: HoyOrder, method: HoyPayment) {
    if (method === o.paymentMethod && !o.cashPartCents) return;
    if (!(await ask(`¿Cambiar el cobro del #${o.orderNumber} a ${PAY[method].toLowerCase()}? El importe (${euros(o.totalCents)}) no cambia; solo cuadra la caja.`, { confirm: "Cambiar", danger: false }))) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/${tenant}/caja/ticket/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo cambiar");
      const fresh = await load();
      setTicket(fresh?.orders.find((x) => x.id === o.id) ?? null);
      setMsg({ ok: true, text: `Cobro cambiado a ${PAY[method].toLowerCase()}` });
      onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo cambiar" });
    } finally {
      setBusy(false);
    }
  }

  async function reprint(o: HoyOrder) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/${tenant}/print/${o.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "RECEIPT" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "No se pudo imprimir");
      setMsg({ ok: true, text: "Ticket enviado a la impresora" });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo imprimir" });
    } finally {
      setBusy(false);
    }
  }

  const isToday = !data || data.date === data.today;
  const title = isToday ? "Hoy en caja" : "Caja del día";
  const t = ticket;
  const methodEditable = !!t && !!data?.canMethod && t.paid && t.status !== "CANCELLED" && CHANGEABLE.includes(t.paymentMethod);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-[24px] bg-[var(--p-surface)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[var(--p-ink)] lg:max-w-xl lg:rounded-[24px] lg:p-6">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15 lg:hidden" />
        {t ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <button type="button" onClick={() => setTicket(null)} className={BTN.back}>‹ Todos los tickets</button>
              <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">Cerrar</button>
            </div>
            <h2 className="mt-1 text-xl font-semibold">#{t.orderNumber} {t.customerName}</h2>
            <p className="text-sm text-[var(--p-muted)]">
              {hourOf(t.createdAt)} · {t.status === "CANCELLED" ? "Cancelado" : t.paid ? `Cobrado con ${t.cashPartCents ? "pago mixto" : PAY[t.paymentMethod].toLowerCase()}` : "Sin cobrar"}
              {detail?.invoiceNumber && ` · Factura ${detail.invoiceNumber}`}
            </p>
            <ul className="mt-4 divide-y divide-[var(--p-line)] rounded-2xl bg-[var(--p-bg)] px-4">
              {!detail ? (
                <li className="py-6 text-center text-sm text-[var(--p-muted)]">Cargando…</li>
              ) : (
                detail.lines.map((l) => (
                  <li key={l.id} className="flex gap-3 py-2.5 text-sm">
                    <span className="w-6 shrink-0 font-semibold tabular-nums">{l.quantity}×</span>
                    <span className="min-w-0 flex-1">
                      {l.name}
                      {l.modifiers.length > 0 && <span className="block text-xs text-[var(--p-muted)]">{l.modifiers.join(" · ")}</span>}
                      {l.note && <span className="block text-xs text-[var(--p-muted)]">{l.note}</span>}
                    </span>
                    <span className="tabular-nums">{euros(l.totalCents)}</span>
                  </li>
                ))
              )}
              <li className="flex justify-between py-3 text-base font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{euros(t.totalCents)}</span>
              </li>
            </ul>
            {methodEditable && (
              <section className="mt-5">
                <h3 className="text-sm font-semibold">¿Cómo pagó?</h3>
                <p className="text-xs text-[var(--p-muted)]">Si te dijo tarjeta y al final pagó en efectivo o Bizum, cámbialo aquí: la caja cuadra sola.</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {CHANGEABLE.map((m) => {
                    const on = t.paymentMethod === m && !t.cashPartCents;
                    return (
                      <button key={m} type="button" disabled={busy} aria-pressed={on} onClick={() => changeMethod(t, m)} className={`p-press min-h-12 rounded-2xl border-2 text-sm font-semibold ${on ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)] text-[var(--p-brand-strong)]" : "border-[var(--p-line)]"}`}>
                        {PAY[m]}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {msg && <p className={`mt-3 rounded-2xl px-4 py-2.5 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-[var(--p-accent-soft)] text-[var(--p-accent)]"}`} role="status">{msg.text}</p>}
            {t.paid && t.status !== "CANCELLED" && (
              <button type="button" disabled={busy} onClick={() => reprint(t)} className={`${BTN.secondary} mt-4 w-full`}>Reimprimir el ticket</button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="text-xs text-[var(--p-muted)] first-letter:uppercase">{data?.day}</p>
              </div>
              <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">Cerrar</button>
            </div>
            <div className="mt-3 flex items-center gap-1 self-start rounded-full bg-black/[0.05] p-1">
              <button type="button" aria-label="Día anterior" disabled={!data} onClick={() => data && setDate(shiftDay(data.date, -1))} className="p-press h-10 w-10 rounded-full text-lg font-semibold">‹</button>
              <button type="button" disabled={isToday} onClick={() => setDate(null)} className={`p-press h-10 rounded-full px-4 text-sm font-semibold ${isToday ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : ""}`}>Hoy</button>
              <button type="button" aria-label="Día siguiente" disabled={isToday} onClick={() => data && setDate(shiftDay(data.date, 1) >= data.today ? null : shiftDay(data.date, 1))} className="p-press h-10 w-10 rounded-full text-lg font-semibold disabled:opacity-30">›</button>
            </div>
            {!data ? (
              <p className="py-8 text-center text-sm text-[var(--p-muted)]">Cargando…</p>
            ) : (
              <>
                <div className="mt-4 rounded-2xl bg-[var(--p-bg)] p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--p-muted)]">{isToday ? "Ventas de hoy" : "Ventas del día"}</p>
                  <p className="text-4xl font-semibold tabular-nums tracking-tight">{euros(data.totalCents)}</p>
                  <p className="mt-1 text-sm text-[var(--p-muted)]">
                    {data.sales} {data.sales === 1 ? "pedido" : "pedidos"}
                    {data.cancelled > 0 && ` · ${data.cancelled} ${data.cancelled === 1 ? "cancelado" : "cancelados"}`}
                  </p>
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.keys(PAY) as HoyPayment[])
                    .filter((k) => data.byPayment[k] > 0)
                    .map((k) => (
                      <li key={k} className="rounded-xl bg-black/[0.04] px-3 py-2.5">
                        <p className="text-xs text-[var(--p-muted)]">{PAY[k]}</p>
                        <p className="text-lg font-semibold tabular-nums">{euros(data.byPayment[k])}</p>
                      </li>
                    ))}
                  {data.pendingCents > 0 && (
                    <li className="rounded-xl bg-amber-50 px-3 py-2.5 text-amber-900">
                      <p className="text-xs">Pendiente de cobrar</p>
                      <p className="text-lg font-semibold tabular-nums">{euros(data.pendingCents)}</p>
                    </li>
                  )}
                  {data.refundedCents > 0 && (
                    <li className="rounded-xl bg-black/[0.04] px-3 py-2.5">
                      <p className="text-xs text-[var(--p-muted)]">Devuelto</p>
                      <p className="text-lg font-semibold tabular-nums">{euros(data.refundedCents)}</p>
                    </li>
                  )}
                </ul>
                {isToday && <p className="mt-2 text-xs text-[var(--p-muted)]">El efectivo que debe haber en el cajón es la venta en efectivo más el fondo con el que abriste.</p>}
                <p className="mt-4 text-xs text-[var(--p-muted)]">Toca un ticket para ver qué se cobró, reimprimirlo o cambiar cómo pagó.</p>
                <ul className="mt-1 divide-y divide-[var(--p-line)]">
                  {data.orders.length === 0 && <li className="py-8 text-center text-sm text-[var(--p-muted)]">{isToday ? "Todavía no hay pedidos hoy." : "Ese día no hubo pedidos."}</li>}
                  {data.orders.map((o) => (
                    <li key={o.id}>
                      <button type="button" onClick={() => open(o)} className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-left hover:bg-black/[0.03] ${o.status === "CANCELLED" ? "opacity-50" : ""}`}>
                        <span className="w-12 shrink-0 text-xs tabular-nums text-[var(--p-muted)]">{hourOf(o.createdAt)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">#{o.orderNumber} {o.customerName}</span>
                          <span className="block truncate text-xs text-[var(--p-muted)]">
                            {o.source === "ONLINE" ? "Online" : o.source === "PHONE" ? "Teléfono" : "Mostrador"} · {o.channel === "DELIVERY" ? "a domicilio" : o.dineIn ? "comer aquí" : "para llevar"} · {o.status === "CANCELLED" ? "cancelado" : o.paid ? (o.cashPartCents ? "mixto" : PAY[o.paymentMethod].toLowerCase()) : "sin cobrar"}
                            {o.status !== "CANCELLED" && ` · ${STATUS[o.status] ?? o.status}`}
                          </span>
                        </span>
                        <span className={`text-sm font-semibold tabular-nums ${o.status === "CANCELLED" ? "line-through" : ""}`}>{euros(o.totalCents)}</span>
                        <span aria-hidden className="text-[var(--p-faint)]">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
