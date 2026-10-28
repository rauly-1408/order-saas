"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

// Factura completa a nombre del cliente en tres pasos: buscar su ticket, poner
// sus datos y emitir. Después se abre la hoja para imprimir o enviar por email.
// Ver docs/VERIFACTU.md

type OrderInfo = {
  id: string;
  orderNumber: number | null;
  createdAt: string;
  customerName: string;
  totalCents: number;
  paymentStatus: string;
  status: string;
  items: { quantity: number; productName: string }[];
  invoices: { id: string; invoiceType: string; numSerie: string; recipientName: string | null }[];
};
type Recent = { id: string; numSerie: string; issueDate: string; totalCents: number; recipientName: string | null; recipientNif: string | null; order: { orderNumber: number | null } };
type Lookup = { enabled: boolean; email: boolean; order?: OrderInfo | null; recent?: Recent[]; error?: string };

const euros = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);
const FIELD = "mt-1 min-h-11 w-full rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 text-[15px]";
const CARD = "rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

export default function FacturasClient({ tenant, initialOrder, initialTicket }: { tenant: string; initialOrder: string | null; initialTicket: string | null }) {
  const api = `/api/admin/${tenant}/facturas`;
  const router = useRouter();
  const [info, setInfo] = useState<Lookup | null>(null);
  const [query, setQuery] = useState(initialTicket ?? "");
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [form, setForm] = useState({ nif: "", name: "", address: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(
    async (params: string) => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await fetch(`${api}?${params}`, { cache: "no-store" });
        const data = (await res.json()) as Lookup;
        if (!res.ok) throw new Error(data.error ?? "No se pudo buscar");
        setInfo((i) => ({ ...i, ...data, recent: i?.recent }));
        setOrder(data.order ?? null);
        if (!data.order) setSearchError(data.error ?? "No encontramos ese ticket");
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "No se pudo buscar");
      } finally {
        setSearching(false);
      }
    },
    [api]
  );

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: Lookup) => setInfo((i) => ({ ...d, order: i?.order })))
      .catch(() => setInfo({ enabled: false, email: false, recent: [], error: "No se pudo cargar" }));
    if (initialOrder) lookup(`pedido=${encodeURIComponent(initialOrder)}`);
    else if (initialTicket) lookup(`buscar=${encodeURIComponent(initialTicket)}`);
  }, [api, initialOrder, initialTicket, lookup]);

  async function issue(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, ...form }) });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "No se pudo hacer la factura");
      router.push(`/admin/${tenant}/factura/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo hacer la factura");
      setBusy(false);
    }
  }

  const full = order?.invoices.find((i) => i.invoiceType === "F1" || i.invoiceType === "F3");
  const ticket = order?.invoices.find((i) => i.invoiceType === "F2");
  const blocked = order && (order.status === "CANCELLED" || order.paymentStatus !== "PAID" || order.invoices.some((i) => i.invoiceType.startsWith("R")));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-tight sm:text-[34px]">Facturas</h1>
        <p className="text-sm text-[var(--p-muted)]">Factura a nombre del cliente (empresa o autónomo) a partir de su ticket.</p>
      </div>

      {info && !info.enabled && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Para hacer facturas, activa VeriFactu</p>
          <p className="mt-1">
            Hace falta la razón social y el NIF del negocio. Ve a{" "}
            <Link href={`/admin/${tenant}/configuracion/facturacion`} className="font-semibold underline">
              Configuración → Facturación
            </Link>
            .
          </p>
        </div>
      )}

      {/* 1. Buscar el ticket */}
      <section className={CARD}>
        <h2 className="text-[17px] font-semibold">1. Busca el ticket</h2>
        <p className="text-xs text-[var(--p-muted)]">El número de la factura simplificada del ticket (T2026-000012) o el número del pedido (83).</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) lookup(`buscar=${encodeURIComponent(query.trim())}`);
          }}
          className="mt-3 flex gap-2"
        >
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="T2026-000012 o 83" aria-label="Número del ticket o del pedido" inputMode="text" autoCapitalize="characters" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 text-[15px]" />
          <button type="submit" disabled={searching || !query.trim()} className="p-press min-h-11 shrink-0 rounded-full bg-[var(--p-ink)] px-5 text-sm font-semibold text-white disabled:opacity-40">
            {searching ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {searchError && <p className="mt-2 text-sm text-[var(--p-accent)]">{searchError}</p>}

        {order && (
          <div className="mt-4 rounded-xl bg-[var(--p-bg)] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">
                Pedido {order.orderNumber != null ? `#${order.orderNumber}` : ""} · {order.customerName}
              </p>
              <p className="text-lg font-bold tabular-nums">{euros(order.totalCents)}</p>
            </div>
            <p className="text-xs text-[var(--p-muted)]">
              {new Date(order.createdAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {ticket ? ` · Ticket ${ticket.numSerie}` : ""}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--p-muted)]">{order.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ")}</p>
          </div>
        )}
      </section>

      {/* 2. Datos del cliente y emitir */}
      {order && full && (
        <section className={CARD}>
          <p className="font-semibold">Este pedido ya tiene factura: {full.numSerie}</p>
          <p className="text-sm text-[var(--p-muted)]">A nombre de {full.recipientName}. Solo se hace una por pedido.</p>
          <Link href={`/admin/${tenant}/factura/${full.id}`} className="p-press mt-3 inline-flex min-h-11 items-center rounded-full bg-[var(--p-brand)] px-5 text-sm font-semibold text-white">
            Ver, imprimir o enviar
          </Link>
        </section>
      )}
      {order && !full && blocked && (
        <section className={`${CARD} text-sm`}>
          {order.paymentStatus !== "PAID" && order.status !== "CANCELLED" ? "Este pedido aún no está cobrado: cóbralo primero y luego haz la factura." : "Este pedido está cancelado o devuelto: no se puede facturar."}
        </section>
      )}
      {order && !full && !blocked && (
        <form onSubmit={issue} className={CARD}>
          <h2 className="text-[17px] font-semibold">2. Datos del cliente</h2>
          <p className="text-xs text-[var(--p-muted)]">Tal como deben salir en su factura.{ticket ? ` Sustituirá al ticket ${ticket.numSerie}.` : ""}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              NIF / CIF
              <input required value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value.toUpperCase() })} placeholder="B12345678" autoCapitalize="characters" className={FIELD} />
            </label>
            <label className="block text-sm">
              Razón social o nombre
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Empresa S.L." className={FIELD} />
            </label>
            <label className="block text-sm sm:col-span-2">
              Domicilio fiscal
              <input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Calle Mayor, 1, 18001 Granada" className={FIELD} />
            </label>
            {info?.email && (
              <label className="block text-sm sm:col-span-2">
                Email para enviársela (opcional)
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="facturas@empresa.com" className={FIELD} />
              </label>
            )}
          </div>
          {error && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
          <button type="submit" disabled={busy || !info?.enabled} className="p-press mt-4 min-h-12 w-full rounded-full bg-[var(--p-brand)] px-5 text-base font-semibold text-white disabled:opacity-40 sm:w-auto">
            {busy ? "Haciendo la factura…" : `Hacer factura de ${euros(order.totalCents)}`}
          </button>
        </form>
      )}

      {/* Las últimas hechas */}
      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-4 pt-4 text-[17px] font-semibold sm:px-5">Facturas hechas</h2>
        {!info ? (
          <p className="px-5 py-6 text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : !info.recent?.length ? (
          <p className="px-4 py-6 text-sm text-[var(--p-muted)] sm:px-5">Todavía no has hecho ninguna factura a nombre de un cliente.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--p-line)] border-t border-[var(--p-line)]">
            {info.recent.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/${tenant}/factura/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-[var(--p-bg)]/60 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.recipientName}</span>
                    <span className="block truncate text-xs text-[var(--p-muted)]">
                      {r.numSerie} · {r.issueDate} · NIF {r.recipientNif}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{euros(r.totalCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
