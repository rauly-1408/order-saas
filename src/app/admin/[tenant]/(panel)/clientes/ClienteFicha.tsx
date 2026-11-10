"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SEGMENT_LABEL, type Segment } from "@/app/lib/retention";
import { BTN } from "../buttons";
import { SEGMENT_STYLE, euros } from "./types";

// Ficha de un cliente: resumen, lo que más pide, su historial de pedidos (con
// el ticket de cada uno) y la oferta que le recomendamos. Ver docs/CLIENTES.md
type Line = { name: string; quantity: number; totalCents: number | null; modifiers: string[]; note: string | null };
type Order = { id: string; orderNumber: number | null; createdAt: string; cancelled: boolean; totalCents: number | null; payment: string; how: string; notes: string | null; address: string | null; lines: Line[] };
type Ficha = {
  customer: { id: string; name: string | null; phone: string; email: string | null; segment: Segment; marketingConsent: boolean; firstOrderAt: string | null };
  summary: { orders: number; cancelled: number; spentCents: number | null; avgTicketCents: number | null; daysSinceLast: number | null; online: number; inStore: number; payments: { label: string; count: number }[]; usual: string | null };
  top: { name: string; qty: number }[];
  offer: { title: string; why: string; when: string | null; coupon: { type: "PERCENT" | "FIXED"; value: number; minOrderCents: number; days: number }; message: string };
  orders: Order[];
};
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const ago = (d: number | null) => (d == null ? "—" : d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`);
const codeFor = (name: string | null) => `${(name ?? "CLIENTE").normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8) || "CLIENTE"}${Math.floor(10 + Math.random() * 90)}`;

export default function ClienteFicha({ api, customerId, onClose }: { api: string; customerId: string; onClose: () => void }) {
  const [data, setData] = useState<Ficha | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [portal, setPortal] = useState<Element | null>(null);
  useEffect(() => setPortal(document.querySelector(".panel") ?? document.body), []);
  useEffect(() => {
    let alive = true;
    fetch(`${api}/customers/${customerId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "No se pudo cargar el cliente");
        if (alive) setData(d);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No se pudo cargar el cliente"));
    return () => {
      alive = false;
    };
  }, [api, customerId]);

  async function createCoupon() {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const o = data.offer.coupon;
      const exp = new Date(Date.now() + o.days * 86_400_000).toISOString().slice(0, 10);
      for (let i = 0; i < 3; i++) {
        const code = codeFor(data.customer.name);
        const r = await fetch(`${api}/coupons`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, type: o.type, value: o.value, minOrderCents: o.minOrderCents, maxRedemptions: 1, oncePerCustomer: true, expiresAt: exp }) });
        if (r.status === 409) continue;
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "No se pudo crear el cupón");
        setCoupon(code);
        return;
      }
      throw new Error("No se pudo crear el cupón");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cupón");
    } finally {
      setBusy(false);
    }
  }

  const c = data?.customer;
  const s = data?.summary;
  const wa = data && coupon && c?.marketingConsent ? `https://wa.me/34${c.phone.replace(/\D/g, "").replace(/^34(?=\d{9}$)/, "")}?text=${encodeURIComponent(`${data.offer.message} Código: ${coupon}`)}` : null;

  if (!portal) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label="Ficha del cliente">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[94vh] w-full flex-col overflow-y-auto [&>*]:shrink-0 rounded-t-[24px] bg-[var(--p-bg)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[var(--p-ink)] lg:max-w-3xl lg:rounded-[24px] lg:p-6">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15 lg:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--p-surface)] text-lg font-semibold">{(c?.name ?? "?").charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold">{c ? (c.name ?? "Sin nombre") : "Cargando…"}</h2>
              {c && (
                <p className="text-sm text-[var(--p-muted)]">
                  <a href={`tel:${c.phone}`} className="font-medium text-[var(--p-brand)]">{c.phone}</a>
                  {c.email && ` · ${c.email}`}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">Cerrar</button>
        </div>
        {error && <p className="mt-3 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
        {data && c && s && (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEGMENT_STYLE[c.segment]}`}>{SEGMENT_LABEL[c.segment]}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${c.marketingConsent ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-[var(--p-muted)]"}`}>{c.marketingConsent ? "Acepta ofertas" : "No quiere ofertas"}</span>
            </div>

            {/* Resumen */}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Pedidos", String(s.orders)],
                ["Gastado", s.spentCents != null ? euros(s.spentCents) : "—"],
                ["Ticket medio", s.avgTicketCents != null ? euros(s.avgTicketCents) : "—"],
                ["Último pedido", ago(s.daysSinceLast)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-2xl bg-[var(--p-surface)] px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--p-muted)]">{k}</p>
                  <p className="text-lg font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 rounded-2xl bg-[var(--p-surface)] px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p><span className="text-[var(--p-muted)]">Cómo paga:</span> {s.payments.length ? s.payments.map((p) => `${p.label} (${p.count})`).join(" · ") : "—"}</p>
              <p><span className="text-[var(--p-muted)]">Dónde pide:</span> {s.online} online · {s.inStore} en el local</p>
              {s.usual && <p><span className="text-[var(--p-muted)]">Suele pedir:</span> {s.usual}</p>}
              {data.top.length > 0 && <p><span className="text-[var(--p-muted)]">Lo que más pide:</span> {data.top.map((t) => `${t.name} (${t.qty})`).join(" · ")}</p>}
            </div>

            {/* Oferta recomendada */}
            <section className="mt-4 rounded-2xl bg-[var(--p-brand-soft)] p-4" aria-labelledby="oferta">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--p-brand-strong)]">Oferta recomendada</p>
              <h3 id="oferta" className="text-lg font-semibold text-[var(--p-brand-strong)]">{data.offer.title}</h3>
              <p className="mt-1 text-sm">{data.offer.why}</p>
              {data.offer.when && <p className="mt-1 text-sm">{data.offer.when}</p>}
              <p className="mt-2 rounded-xl bg-[var(--p-surface)] px-3 py-2 text-sm italic">«{data.offer.message}{coupon ? ` Código: ${coupon}` : ""}»</p>
              {!coupon ? (
                <button type="button" disabled={busy} onClick={createCoupon} className={`${BTN.primary} mt-3`}>{busy ? "Creando…" : "Crear el cupón"}</button>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--p-surface)] px-3 py-2 font-mono text-sm font-semibold tracking-wider">{coupon}</span>
                  <span className="text-sm">Cupón creado: un solo uso, válido {data.offer.coupon.days} días.</span>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={BTN.primary}>Mandar por WhatsApp</a>}
                </div>
              )}
              {!c.marketingConsent && <p className="mt-2 text-xs text-[var(--p-muted)]">No ha aceptado recibir ofertas: no se le puede escribir para esto (RGPD). Dale el código en persona o en su próximo pedido.</p>}
            </section>

            {/* Historial */}
            <h3 className="mt-5 text-sm font-semibold">Historial de pedidos</h3>
            <ul className="mt-2 divide-y divide-[var(--p-line)] overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {data.orders.length === 0 && <li className="px-4 py-6 text-center text-sm text-[var(--p-muted)]">Sin pedidos.</li>}
              {data.orders.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02] ${o.cancelled ? "opacity-50" : ""}`}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium first-letter:uppercase">{fecha(o.createdAt)} · {hora(o.createdAt)} <span className="text-[var(--p-muted)]">#{o.orderNumber}</span></span>
                      <span className="block truncate text-xs text-[var(--p-muted)]">{o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}</span>
                      <span className="block text-xs text-[var(--p-muted)]">{o.how} · {o.cancelled ? "cancelado" : o.payment}</span>
                    </span>
                    {o.totalCents != null && <span className={`text-sm font-semibold tabular-nums ${o.cancelled ? "line-through" : ""}`}>{euros(o.totalCents)}</span>}
                    <span aria-hidden className="text-[var(--p-faint)]">{open === o.id ? "▾" : "›"}</span>
                  </button>
                  {open === o.id && (
                    <div className="mx-4 mb-3 rounded-xl bg-[var(--p-bg)] px-3 py-2 text-sm">
                      {o.lines.map((l, i) => (
                        <div key={i} className="flex gap-2 py-1">
                          <span className="w-6 shrink-0 font-semibold tabular-nums">{l.quantity}×</span>
                          <span className="min-w-0 flex-1">
                            {l.name}
                            {l.modifiers.length > 0 && <span className="block text-xs text-[var(--p-muted)]">{l.modifiers.join(" · ")}</span>}
                            {l.note && <span className="block text-xs text-[var(--p-muted)]">{l.note}</span>}
                          </span>
                          {l.totalCents != null && <span className="tabular-nums">{euros(l.totalCents)}</span>}
                        </div>
                      ))}
                      {o.address && <p className="mt-1 text-xs text-[var(--p-muted)]">Entrega: {o.address}</p>}
                      {o.notes && <p className="mt-1 text-xs">Nota: {o.notes}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>,
    portal
  );
}
