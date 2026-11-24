"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HoyOrder, HoyPayment, HoyResponse } from "@/app/api/admin/[tenant]/caja/hoy/route";
import CashSessionSheet, { type CashState, type Closing, type ShiftView, type ClosingSummaryView } from "./CashSessionSheet";
import LendCaja from "./LendCaja";
import CajaDia, { type TicketDetail } from "./CajaDia";
import Link from "next/link";
import { usePrintPreview } from "../PrintPreview";
import { howLabel } from "../pedidos/orderBoard";
import NewOrder, { type NewOrderProps } from "../NewOrder";

// Caja (menú): el dinero del local, pensado para el día a día.
// 1. Tu caja: cerrada → «Abrir caja»; abierta → el turno en curso y lo que hay
//    en el cajón ahora (inicio del turno + efectivo + entradas − salidas),
//    «Cerrar turno (X)», «Cerrar caja del día (Z)» (encargado o gerente) y
//    «Entra / Sale dinero». Debajo, los turnos ya cerrados hoy.
// 2. Lo vendido: total, pedidos, ticket medio, barra por forma de pago y lo
//    pendiente de cobrar.
// 3. Tickets: lista clara (hora, nº, nombre, de dónde viene, cómo pagó, estado,
//    importe) con filtros rápidos, búsqueda y ‹ día ›. Al tocar uno, su detalle.
// «＋ Nuevo pedido» abre encima la pantalla de tomar pedidos. Ver docs/CAJA.md

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const shiftDay = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Formas de pago: nombre y color fijo (opaco: el iPad antiguo no entiende transparencias).
const PAY: Record<HoyPayment, { label: string; color: string }> = {
  CASH: { label: "Efectivo", color: "bg-[#16a34a]" },
  CARD_TERMINAL: { label: "Datáfono", color: "bg-[#2563eb]" },
  BIZUM: { label: "Bizum", color: "bg-[#0891b2]" },
  CARD: { label: "Tarjeta online", color: "bg-[#7c3aed]" },
  IN_STORE: { label: "Al recoger", color: "bg-[#d97706]" },
};
const FROM: Record<HoyOrder["source"], string> = { COUNTER: "Mostrador", PHONE: "Teléfono", TABLE: "Sala", ONLINE: "Online" };
const STATUS: Record<string, string> = { OPEN: "Mesa abierta", CREATED: "Nuevo", PAID: "Nuevo", SENT_TO_POS: "Nuevo", ACCEPTED: "Preparando", PREPARING: "Preparando", READY: "Listo", DELIVERING: "En reparto", DELIVERED: "Entregado", CANCELLED: "Cancelado" };

type Filter = "todos" | "pendientes" | "CASH" | "CARD_TERMINAL" | "BIZUM" | "cancelados";
const FILTERS: [Filter, string][] = [
  ["todos", "Todos"],
  ["pendientes", "Sin cobrar"],
  ["CASH", "Efectivo"],
  ["CARD_TERMINAL", "Datáfono"],
  ["BIZUM", "Bizum"],
  ["cancelados", "Cancelados"],
];
const matches = (o: HoyOrder, f: Filter) => {
  const cancelled = o.status === "CANCELLED";
  if (f === "todos") return true;
  if (f === "cancelados") return cancelled;
  if (f === "pendientes") return !o.paid && !cancelled;
  return o.paid && !cancelled && (o.paymentMethod === f || (f === "CASH" && o.cashPartCents > 0));
};

type Sheet = null | "main" | "shift" | "close" | "in" | "out" | "movimientos";
const CARD = "rounded-3xl p-5 ring-1 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:p-6";
const BIG = "p-press flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-semibold";

export default function CajaPanel({ tenant, canSeeTakings, newOrder }: { tenant: string; canSeeTakings: boolean; newOrder: NewOrderProps }) {
  const [cash, setCash] = useState<CashState | null>(null);
  const [cashError, setCashError] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [composer, setComposer] = useState(false);
  const [date, setDate] = useState<string | null>(null); // null = hoy
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todos");
  const [day, setDay] = useState<HoyResponse | null>(null);
  const [ticket, setTicket] = useState<HoyOrder | null>(null);
  const [showAll, setShowAll] = useState(false); // la lista empieza con los 6 últimos (menos scroll)
  // Tickets como en Pedidos: tarjetas que se abren ahí mismo con su detalle.
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, TicketDetail>>({});
  const printer = usePrintPreview(tenant);
  // Cierres de caja anteriores (informe Z): se abren ahí mismo y se reimprimen.
  const [openClosing, setOpenClosing] = useState<string | null>(null);
  const [allClosings, setAllClosings] = useState(false); // los 3 últimos y «Ver todos»
  const printHere = (id: string) => {
    setOpenClosing(id);
    setTimeout(() => {
      document.getElementById(`cierre-${id}`)?.classList.add("print-area");
      document.body.classList.add("printing-area");
      window.print();
      document.body.classList.remove("printing-area");
      document.getElementById(`cierre-${id}`)?.classList.remove("print-area");
    }, 60);
  };
  const toggle = (o: HoyOrder) => {
    const next = openId === o.id ? null : o.id;
    setOpenId(next);
    if (next && !details[o.id])
      fetch(`/api/admin/${tenant}/caja/ticket/${o.id}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: TicketDetail | null) => d && setDetails((m) => ({ ...m, [o.id]: d })))
        .catch(() => {});
  };

  const loadCash = useCallback(() => {
    fetch(`/api/admin/${tenant}/caja/sesion`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: CashState) => {
        setCash(d);
        setCashError(false);
      })
      .catch(() => setCashError(true));
  }, [tenant]);

  const dayUrl = `/api/admin/${tenant}/caja/hoy?${new URLSearchParams({ ...(date && { fecha: date }), ...(search && { buscar: search }) })}`;
  const loadDay = useCallback(() => {
    if (!canSeeTakings) return;
    fetch(dayUrl, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: HoyResponse | null) => d && setDay(d))
      .catch(() => {});
  }, [dayUrl, canSeeTakings]);

  useEffect(() => {
    loadCash();
  }, [loadCash]);
  useEffect(() => {
    loadDay();
  }, [loadDay]);
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim().length >= 2 ? query.trim() : ""), 300);
    return () => clearTimeout(t);
  }, [query]);

  const refresh = () => {
    loadCash();
    loadDay();
  };

  const open = cash?.open;
  const fig = cash?.figures;
  const isToday = !day || day.date === day.today;
  const searching = !!day?.search;
  const avg = day && day.sales > 0 ? Math.round(day.totalCents / day.sales) : 0;
  const payKeys = day ? (Object.keys(PAY) as HoyPayment[]).filter((k) => day.byPayment[k] > 0) : [];
  const paySum = payKeys.reduce((a, k) => a + (day?.byPayment[k] ?? 0), 0);
  const list = useMemo(() => (day?.orders ?? []).filter((o) => matches(o, filter)), [day, filter]);
  const SHORT = 6;
  const shown = showAll || searching ? list : list.slice(0, SHORT);
  const countOf = (f: Filter) => (day?.orders ?? []).filter((o) => matches(o, f)).length;

  return (
    <div className="text-[var(--p-ink)]">
      {printer.node}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Caja</h1>
          {cash && (
            <p className="mt-1.5 inline-flex items-center gap-2 rounded-full bg-[var(--p-surface)] px-3 py-1 text-sm font-semibold ring-1 ring-[var(--p-line)]">
              <span aria-hidden className={`h-2 w-2 rounded-full ${open ? "bg-emerald-500" : "bg-amber-500"}`} />
              {open ? `Abierta desde las ${hhmm(open.openedAt)}${open.openedByName ? ` · ${open.openedByName}` : ""}` : "Cerrada"}
            </p>
          )}
        </div>
        <button type="button" onClick={() => setComposer(true)} className="p-press flex min-h-12 items-center rounded-full bg-[var(--p-brand)] px-6 text-[15px] font-semibold text-[var(--p-on-brand)] shadow-sm">
          ＋ Nuevo pedido
        </button>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* 1. Tu caja */}
        <section aria-label="Estado de la caja" className={`${CARD} lg:col-span-2 bg-[var(--p-surface)] ring-[var(--p-line)]`}>
          {!cash ? (
            <p className="py-8 text-center text-sm text-[var(--p-muted)]">{cashError ? "No se ha podido cargar la caja. Revisa la conexión." : "Cargando…"}</p>
          ) : !open ? (
            /* Caja cerrada: estado claro, qué hacer y el último cierre como referencia. */
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">Tu caja</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-amber-500" />
                  Cerrada
                </span>
              </div>
              <div className="mt-4 flex items-start gap-4">
                <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--p-brand-soft)] text-[var(--p-brand-strong)]">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="10" width="18" height="10" rx="2" />
                    <path d="M7 10V7a5 5 0 0 1 10 0v3" />
                    <circle cx="12" cy="15" r="1.5" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold tracking-tight">Abre la caja para vender</p>
                  <p className="mt-1 text-sm text-[var(--p-muted)]">Cuenta el efectivo que dejas en el cajón para el cambio (puede ser 0).</p>
                </div>
              </div>
              {cash.history[0] && (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[var(--p-bg)] px-4 py-3">
                  <span className="min-w-0">
                    <span className="block text-xs text-[var(--p-muted)]">Último cierre</span>
                    <span className="block truncate text-sm font-semibold first-letter:uppercase">
                      {dayLabel(cash.history[0].closedAt)}, {hhmm(cash.history[0].closedAt)}
                      {cash.history[0].closedByName && <span className="font-normal text-[var(--p-muted)]"> · {cash.history[0].closedByName}</span>}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular-nums">{euros(cash.history[0].countedCashCents)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${diffTone(cash.history[0].differenceCents)}`}>{cash.history[0].differenceCents === 0 ? "Cuadró" : diffLabel(cash.history[0].differenceCents)}</span>
                  </span>
                </div>
              )}
              <div aria-hidden className="min-h-5 flex-1" />
              <button type="button" onClick={() => setSheet("main")} className={`${BIG} w-full bg-[var(--p-brand)] text-[var(--p-on-brand)]`}>
                Abrir caja
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              {cash.lent && (
                <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Tienes la caja prestada{cash.lent.by ? ` por ${cash.lent.by}` : ""}
                  {cash.lent.closeDay ? ", también el cierre del día" : ""}. Se quita sola al cerrar el día.
                </p>
              )}
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">
                Turno {open.shift?.number ?? 1} · desde las {hhmm(open.shift?.startedAt ?? open.openedAt)}
                {open.shift?.startedByName && ` · ${open.shift.startedByName}`}
              </p>
              {fig ? (
                <>
                  <p className="mt-2 text-xs text-[var(--p-muted)]">En el cajón ahora</p>
                  <p className="text-4xl font-semibold tabular-nums tracking-tight">{euros(fig.expectedCashCents)}</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--p-muted)]">{(open.shift?.number ?? 1) > 1 ? "Al empezar el turno" : "Fondo de apertura"}</dt>
                      <dd className="tabular-nums">{euros(open.shift?.openingCashCents ?? open.openingFloatCents)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--p-muted)]">Ventas en efectivo</dt>
                      <dd className="tabular-nums">+ {euros(fig.cashSalesCents)}</dd>
                    </div>
                    {(fig.inCents > 0 || fig.outCents > 0) && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--p-muted)]">Entradas y salidas</dt>
                        <dd className="tabular-nums">
                          {fig.inCents - fig.outCents >= 0 ? "+ " : "− "}
                          {euros(Math.abs(fig.inCents - fig.outCents))}
                        </dd>
                      </div>
                    )}
                  </dl>
                </>
              ) : (
                <p className="mt-2 text-sm text-[var(--p-muted)]">Al cerrar el turno contarás el cajón.</p>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2 lg:mt-auto lg:pt-5">
                <button type="button" onClick={() => setSheet("in")} className={`${BIG} bg-black/[0.05]`}>
                  + Entra dinero
                </button>
                <button type="button" onClick={() => setSheet("out")} className={`${BIG} bg-black/[0.05]`}>
                  − Sale dinero
                </button>
                <button type="button" onClick={() => setSheet("shift")} className={`${BIG} col-span-2 bg-[var(--p-ink)] text-white`}>
                  Cerrar turno (X)
                </button>
                {cash.canCloseDay && (
                  <button type="button" onClick={() => setSheet("close")} className={`${BIG} col-span-2 bg-[var(--p-accent)] text-white`}>
                    Cerrar caja del día (Z)
                  </button>
                )}
              </div>
              {!cash.canCloseDay && <p className="mt-2 text-center text-xs text-[var(--p-muted)]">El cierre del día (Z) lo hace el encargado o el gerente.</p>}
              {open.shifts.length > 0 && <ShiftsToday shifts={open.shifts} />}
              <button type="button" onClick={() => setSheet("movimientos")} className="mt-3 self-center text-sm font-semibold text-[var(--p-muted)] underline underline-offset-2">
                Movimientos e informe de cómo va
              </button>
            </div>
          )}
        </section>

        {/* 2. Lo vendido */}
        <section aria-label="Lo vendido" className={`${CARD} bg-[var(--p-surface)] ring-[var(--p-line)] lg:col-span-3`}>
          {!canSeeTakings ? (
            <p className="text-sm text-[var(--p-muted)]">Lo vendido solo lo ve quien tiene el permiso «Ve lo recaudado».</p>
          ) : !day ? (
            <p className="py-8 text-center text-sm text-[var(--p-muted)]">Cargando…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">{isToday ? "Vendido hoy" : `Vendido el ${dayLabel(`${day.date}T12:00:00`)}`}</p>
                  <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{euros(day.totalCents)}</p>
                  <p className="mt-1 text-sm text-[var(--p-muted)]">
                    {day.sales} {day.sales === 1 ? "pedido" : "pedidos"}
                    {day.sales > 0 && ` · ticket medio ${euros(avg)}`}
                    {day.cancelled > 0 && ` · ${day.cancelled} ${day.cancelled === 1 ? "cancelado" : "cancelados"}`}
                  </p>
                </div>
                {day.pendingCents > 0 && (
                  <button type="button" onClick={() => setFilter("pendientes")} className="p-press rounded-2xl bg-amber-50 px-4 py-3 text-left ring-1 ring-amber-200">
                    <span className="block text-xs font-semibold text-amber-900">Pendiente de cobrar ›</span>
                    <span className="block text-xl font-semibold tabular-nums text-amber-900">{euros(day.pendingCents)}</span>
                  </button>
                )}
              </div>
              {paySum > 0 && (
                <>
                  <div className="mt-5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-black/[0.05]" role="img" aria-label={payKeys.map((k) => `${PAY[k].label} ${euros(day.byPayment[k])}`).join(", ")}>
                    {payKeys.map((k) => (
                      <span key={k} className={`h-full ${PAY[k].color}`} style={{ width: `${(day.byPayment[k] / paySum) * 100}%` }} />
                    ))}
                  </div>
                  <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
                    {payKeys.map((k) => (
                      <li key={k}>
                        <button
                          type="button"
                          disabled={!(k === "CASH" || k === "CARD_TERMINAL" || k === "BIZUM")}
                          onClick={() => (k === "CASH" || k === "CARD_TERMINAL" || k === "BIZUM") && setFilter(k)}
                          className="p-row flex min-h-10 w-full items-center justify-between gap-2 rounded-xl px-2 text-left text-sm transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${PAY[k].color}`} />
                            {PAY[k].label}
                          </span>
                          <span className="font-semibold tabular-nums">{euros(day.byPayment[k])}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {/* 3. Tickets */}
      {canSeeTakings && (
        <section aria-label="Tickets" className={`${CARD} mt-4 bg-[var(--p-surface)] ring-[var(--p-line)]`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{searching ? "Resultados" : isToday ? "Tickets de hoy" : `Tickets del ${dayLabel(`${day?.date}T12:00:00`)}`}</h2>
            <div className={`flex items-center gap-1 rounded-full bg-black/[0.05] p-1 ${searching ? "hidden" : ""}`}>
              <button type="button" aria-label="Día anterior" disabled={!day} onClick={() => day && setDate(shiftDay(day.date, -1))} className="p-press h-10 w-10 rounded-full text-lg font-semibold">
                ‹
              </button>
              <button type="button" disabled={isToday} onClick={() => setDate(null)} className={`p-press h-10 rounded-full px-4 text-sm font-semibold ${isToday ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : ""}`}>
                Hoy
              </button>
              <button type="button" aria-label="Día siguiente" disabled={isToday} onClick={() => day && setDate(shiftDay(day.date, 1) >= day.today ? null : shiftDay(day.date, 1))} className="p-press h-10 w-10 rounded-full text-lg font-semibold disabled:opacity-30">
                ›
              </button>
            </div>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, teléfono o nº de pedido"
            aria-label="Buscar un ticket"
            className="mt-3 h-12 w-full rounded-xl bg-black/[0.05] px-4 text-[16px] outline-none focus:ring-2 focus:ring-[var(--p-brand)]"
          />
          {!searching && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Filtrar tickets">
              {FILTERS.map(([f, l]) => {
                const n = countOf(f);
                if (f !== "todos" && n === 0) return null;
                return (
                  <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={`p-press min-h-10 rounded-full px-4 text-sm font-semibold ${filter === f ? "bg-[var(--p-ink)] text-white" : "bg-black/[0.05] text-[var(--p-ink)]"}`}>
                    {l} <span className={filter === f ? "text-white" : "text-[var(--p-muted)]"}>{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          {!day ? (
            <p className="py-8 text-center text-sm text-[var(--p-muted)]">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--p-muted)]">{searching ? `Nada con «${day.search}».` : "No hay tickets aquí."}</p>
          ) : (
            <ul className="mt-4 space-y-2 rounded-2xl bg-[var(--p-bg)] p-2">
              {shown.map((o) => {
                const cancelled = o.status === "CANCELLED";
                const isOpen = openId === o.id;
                const d = details[o.id];
                return (
                  <li key={o.id} className="rounded-2xl bg-[var(--p-surface)] px-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
                    <button type="button" onClick={() => toggle(o)} aria-expanded={isOpen} className={`flex min-h-14 w-full items-center gap-3 py-2 text-left ${cancelled ? "opacity-60" : ""}`}>
                      <span aria-hidden className={`text-[var(--p-muted)] transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">
                          <span className="font-bold">#{o.orderNumber}</span> <span className="font-medium">{o.customerName}</span>
                        </span>
                        <span className="block truncate text-xs text-[var(--p-muted)]">
                          {searching ? `${dayLabel(o.createdAt)}, ` : ""}
                          {hhmm(o.createdAt)} · {FROM[o.source]}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`font-semibold tabular-nums ${cancelled ? "line-through" : ""}`}>{euros(o.totalCents)}</span>
                        {cancelled ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Cancelado</span>
                        ) : o.paid ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--p-bg)] px-2 py-0.5 text-[11px] font-semibold">
                            <span aria-hidden className={`h-2 w-2 rounded-full ${PAY[o.paymentMethod].color}`} />
                            {o.cashPartCents > 0 ? "Mixto" : PAY[o.paymentMethod].label}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Sin cobrar</span>
                        )}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="mb-3 rounded-2xl bg-[var(--p-bg)] p-4">
                        {!d ? (
                          <p className="text-center text-sm text-[var(--p-muted)]">Cargando…</p>
                        ) : (
                          <>
                            <ul className="space-y-1.5">
                              {d.lines.map((l) => (
                                <li key={l.id} className="flex gap-2">
                                  <span className="w-7 shrink-0 font-semibold tabular-nums">{l.quantity}×</span>
                                  <span className="min-w-0 flex-1">
                                    {l.name}
                                    {l.modifiers.length > 0 && <span className="block text-xs text-[var(--p-muted)]">{l.modifiers.join(" · ")}</span>}
                                    {l.note && <span className="block text-xs text-[var(--p-muted)]">Nota: {l.note}</span>}
                                  </span>
                                  <span className="tabular-nums">{euros(l.totalCents)}</span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3 grid gap-x-4 gap-y-1 border-t border-[var(--p-line)] pt-3 sm:grid-cols-2">
                              <p>
                                <span className="text-[var(--p-muted)]">Pedido:</span> {FROM[o.source]} · {howLabel({ channel: d.channel, source: o.source, dineIn: d.dineIn })}
                              </p>
                              <p>
                                <span className="text-[var(--p-muted)]">Hora:</span> {dayLabel(o.createdAt)}, {hhmm(o.createdAt)}
                              </p>
                              <p>
                                <span className="text-[var(--p-muted)]">Estado:</span> {STATUS[o.status] ?? o.status}
                              </p>
                              <p>
                                <span className="text-[var(--p-muted)]">Pago:</span> {cancelled ? "Cancelado" : o.totalCents === 0 ? "Sin importe (0 €)" : o.paid ? (o.cashPartCents > 0 ? `Mixto (${euros(o.cashPartCents)} en efectivo)` : PAY[o.paymentMethod].label) : "Sin cobrar"}
                              </p>
                              {d.customer.phone && (
                                <p>
                                  <span className="text-[var(--p-muted)]">Teléfono:</span> {d.customer.phone}
                                </p>
                              )}
                              {d.customer.address && (
                                <p>
                                  <span className="text-[var(--p-muted)]">Dirección:</span> {d.customer.address}
                                </p>
                              )}
                              {d.invoiceNumber && (
                                <p>
                                  <span className="text-[var(--p-muted)]">Factura:</span> {d.invoiceNumber}
                                </p>
                              )}
                            </div>
                            {d.notes && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Nota: {d.notes}</p>}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-base font-semibold">Total {euros(o.totalCents)}</p>
                              <span className="flex flex-wrap gap-2">
                                {o.paid && !cancelled && day?.canMethod && (o.paymentMethod === "CASH" || o.paymentMethod === "CARD_TERMINAL" || o.paymentMethod === "BIZUM") && (
                                  <button type="button" onClick={() => setTicket(o)} className="inline-flex min-h-11 items-center rounded-full bg-black/[0.05] px-4 text-xs font-semibold">
                                    Cambiar cómo pagó
                                  </button>
                                )}
                                {o.paid && !cancelled && o.totalCents > 0 && (
                                  <Link href={`/admin/${tenant}/facturas?pedido=${o.id}`} className="inline-flex min-h-11 items-center rounded-full bg-black/[0.05] px-4 text-xs font-semibold">
                                    🧾 Factura
                                  </Link>
                                )}
                                <button type="button" onClick={() => printer.print(o.id, "KITCHEN", `#${o.orderNumber}`)} className="inline-flex min-h-11 items-center rounded-full bg-black/[0.05] px-4 text-xs font-semibold">
                                  🖨 Comanda
                                </button>
                                <button type="button" onClick={() => printer.print(o.id, "RECEIPT", `#${o.orderNumber}`)} className="inline-flex min-h-11 items-center rounded-full bg-black/[0.05] px-4 text-xs font-semibold">
                                  🖨 Ticket
                                </button>
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!showAll && !searching && list.length > SHORT && (
            <button type="button" onClick={() => setShowAll(true)} className="p-press mt-2 min-h-12 w-full rounded-2xl bg-black/[0.05] text-sm font-semibold">
              Ver los {list.length} tickets
            </button>
          )}
        </section>
      )}

      {/* Dejar la caja a un camarero (solo encargado o gerente) */}
      {cash?.canLend && <LendCaja tenant={tenant} />}

      {/* 4. Cierres de caja: qué se hizo cada día (informe Z), para verlo o imprimirlo cuando quieras */}
      {canSeeTakings && cash && cash.history.length > 0 && (
        <section aria-label="Cierres de caja" className={`${CARD} mt-4 bg-[var(--p-surface)] ring-[var(--p-line)]`}>
          <h2 className="text-lg font-semibold">Cierres de caja</h2>
          <p className="mt-0.5 text-sm text-[var(--p-muted)]">Cada día cerrado (Z) con sus turnos (X): quién estuvo, si cuadró y por qué no. Toca uno para ver todas sus cifras o imprimirlo.</p>
          <ul className="mt-4 space-y-2 rounded-2xl bg-[var(--p-bg)] p-2">
            {(allClosings ? cash.history : cash.history.slice(0, 3)).map((c) => (
              <ClosingCard
                key={c.id}
                c={c}
                open={openClosing === c.id}
                onToggle={() => setOpenClosing(openClosing === c.id ? null : c.id)}
                onPrint={(detailed) => printer.printReport({ sessionId: c.id, detailed }, dayLabel(c.closedAt))}
                onPrintHere={() => printHere(c.id)}
                onPrintShift={(sh) => printer.printReport({ shiftId: sh.id }, `X${sh.number} · ${dayLabel(c.closedAt)}`)}
              />
            ))}
          </ul>
          {!allClosings && cash.history.length > 3 && (
            <button type="button" onClick={() => setAllClosings(true)} className="p-press mt-2 min-h-12 w-full rounded-2xl bg-black/[0.05] text-sm font-semibold">
              Ver los {cash.history.length} cierres
            </button>
          )}
        </section>
      )}

      {sheet && (
        <CashSessionSheet
          tenant={tenant}
          state={cash}
          start={sheet}
          onState={(s) => {
            setCash(s);
            loadDay();
          }}
          onClose={() => {
            setSheet(null);
            refresh();
          }}
        />
      )}
      {ticket && (
        <CajaDia
          tenant={tenant}
          initialTicket={ticket}
          onChanged={refresh}
          onClose={() => {
            setTicket(null);
            refresh();
          }}
        />
      )}
      {composer && (
        <NewOrder
          tenant={tenant}
          {...newOrder}
          onClose={() => {
            setComposer(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// Un cierre de caja (informe Z) en la lista: fecha, horas y si cuadró; al
// abrirlo, todas las cifras como en el papel.
function ClosingRow({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? "font-semibold" : ""}`}>
      <dt className={strong ? "" : "text-[var(--p-muted)]"}>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

const diffTone = (d: number) => (d === 0 ? "bg-emerald-50 text-emerald-700" : Math.abs(d) <= 100 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-600");
const diffLabel = (d: number) => (d === 0 ? "Cuadra" : d > 0 ? `Sobran ${euros(d)}` : `Faltan ${euros(-d)}`);

// Turnos (X) ya cerrados hoy, en «Tu caja».
function ShiftsToday({ shifts }: { shifts: ShiftView[] }) {
  return (
    <div className="mt-4 border-t border-[var(--p-line)] pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">Turnos cerrados hoy</p>
      <ul className="mt-1.5 space-y-1.5 text-sm">
        {shifts.map((sh) => (
          <li key={sh.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate font-medium">
                X{sh.number} · {hhmm(sh.startedAt)}–{hhmm(sh.endedAt)}
              </span>
              <span className="block truncate text-xs text-[var(--p-muted)]">
                {sh.closedByName ?? "—"}
                {sh.notes && ` · ${sh.notes}`}
              </span>
            </span>
            {sh.differenceCents != null && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${diffTone(sh.differenceCents)}`}>{diffLabel(sh.differenceCents)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Lo invitado por la casa, con quién lo invitó.
function Invitations({ sm }: { sm?: ClosingSummaryView | null }) {
  const inv = sm?.invitations ?? [];
  if (!inv.length) return null;
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-[var(--p-muted)]">Invitaciones</p>
      <ul className="mt-0.5 space-y-0.5">
        {inv.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              {i.quantity}× {i.name}
              {i.by && <span className="text-[var(--p-muted)]"> · {i.by}</span>}
            </span>
            <span className="tabular-nums">{euros(i.valueCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClosingCard({ c, open, onToggle, onPrint, onPrintHere, onPrintShift }: { c: Closing; open: boolean; onToggle: () => void; onPrint: (detailed: boolean) => void; onPrintHere: () => void; onPrintShift: (sh: ShiftView) => void }) {
  const [detail, setDetail] = useState(false); // desglose de cada turno
  const sm = c.summary;
  const diff = c.differenceCents;
  const shifts = c.shifts ?? [];
  return (
    <li id={`cierre-${c.id}`} className="rounded-2xl bg-[var(--p-surface)] px-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-1 ring-black/[0.04]">
      <button type="button" onClick={onToggle} aria-expanded={open} className="no-print flex min-h-14 w-full items-center gap-3 py-2 text-left">
        <span aria-hidden className={`text-[var(--p-muted)] transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold first-letter:uppercase">{dayLabel(c.closedAt)}</span>
          <span className="block truncate text-xs text-[var(--p-muted)]">
            {hhmm(c.openedAt)} – {hhmm(c.closedAt)}
            {shifts.length > 1 && ` · ${shifts.length} turnos`}
            {c.closedByName && ` · cerró ${c.closedByName}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {sm && <span className="font-semibold tabular-nums">{euros(sm.totalCents)}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${diffTone(diff)}`}>{diff === 0 ? "Cuadre perfecto" : diffLabel(diff)}</span>
        </span>
      </button>
      {open && (
        <div className="mb-3 rounded-2xl bg-[var(--p-bg)] p-4">
          <p className="mb-3 hidden text-base font-semibold print:block">Cierre del día (Z) · {dayLabel(c.closedAt)}</p>
          {shifts.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">Turnos ({shifts.length})</p>
                <button type="button" onClick={() => setDetail((v) => !v)} aria-expanded={detail} className="no-print min-h-11 text-xs font-semibold text-[var(--p-brand)]">
                  {detail ? "Ver resumen" : "Ver detalle por turno"}
                </button>
              </div>
              <ul className="mt-1 space-y-2">
                {shifts.map((sh) => (
                  <li key={sh.id} className="rounded-xl bg-[var(--p-surface)] p-3 ring-1 ring-[var(--p-line)]">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-semibold">
                          X{sh.number} · {hhmm(sh.startedAt)}–{hhmm(sh.endedAt)}
                        </span>
                        <span className="block text-xs text-[var(--p-muted)]">
                          {sh.startedByName && sh.startedByName !== sh.closedByName ? `${sh.startedByName} → ` : ""}
                          {sh.closedByName ?? "—"}
                        </span>
                      </span>
                      {sh.differenceCents != null && <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${diffTone(sh.differenceCents)}`}>{diffLabel(sh.differenceCents)}</span>}
                    </div>
                    <dl className="mt-2 space-y-0.5">
                      {sh.summary && <ClosingRow k="Ventas del turno" v={euros(sh.summary.totalCents)} />}
                      {sh.countedCashCents != null && <ClosingRow k="Efectivo contado" v={euros(sh.countedCashCents)} />}
                      {detail && sh.summary && (
                        <>
                          {Object.entries(sh.summary.byPayment)
                            .filter(([, v]) => v)
                            .map(([k, v]) => <ClosingRow key={k} k={`Cobrado · ${PAY[k as HoyPayment]?.label ?? k}`} v={euros(v)} />)}
                          {sh.openingCashCents != null && <ClosingRow k="Al empezar" v={euros(sh.openingCashCents)} />}
                          {!!sh.summary.inCents && <ClosingRow k="+ Entradas" v={euros(sh.summary.inCents)} />}
                          {!!sh.summary.outCents && <ClosingRow k="− Salidas" v={euros(sh.summary.outCents)} />}
                          {sh.expectedCashCents != null && <ClosingRow k="Debería haber" v={euros(sh.expectedCashCents)} />}
                          {!!sh.summary.cancelled && <ClosingRow k={`Cancelados (${sh.summary.cancelled})`} v={sh.summary.refundedCents ? `devuelto ${euros(sh.summary.refundedCents)}` : "—"} />}
                        </>
                      )}
                    </dl>
                    {detail && <Invitations sm={sh.summary} />}
                    {sh.notes && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">Nota: {sh.notes}</p>}
                    {detail && (
                      <button type="button" onClick={() => onPrintShift(sh)} className="no-print mt-2 min-h-11 text-xs font-semibold text-[var(--p-brand)]">
                        🖨 Imprimir este turno
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">Ventas del día</p>
              <dl className="mt-1 space-y-1">
                {sm &&
                  Object.entries(sm.byPayment)
                    .filter(([, v]) => v)
                    .map(([k, v]) => <ClosingRow key={k} k={PAY[k as HoyPayment]?.label ?? k} v={euros(v)} />)}
                {sm && <ClosingRow k={`Total (${sm.orders} pedidos)`} v={euros(sm.totalCents)} strong />}
                {sm && sm.orders > 0 && <ClosingRow k="Ticket medio" v={euros(Math.round(sm.totalCents / sm.orders))} />}
                {sm?.baseCents != null && <ClosingRow k="Base imponible" v={euros(sm.baseCents)} />}
                {sm?.taxCents != null && <ClosingRow k={`IVA ${sm.taxRate ?? ""} %`} v={euros(sm.taxCents)} />}
                {!!sm?.tipsCents && <ClosingRow k="Propinas" v={euros(sm.tipsCents)} />}
                {!!sm?.discountCents && <ClosingRow k="Descuentos hechos" v={euros(sm.discountCents)} />}
                {!!sm?.invitedCents && <ClosingRow k={`Invitaciones (${(sm.invitations ?? []).reduce((a, i) => a + i.quantity, 0)})`} v={euros(sm.invitedCents)} />}
                {!!sm?.cancelled && <ClosingRow k={`Cancelados (${sm.cancelled})`} v={sm.refundedCents ? `devuelto ${euros(sm.refundedCents)}` : "—"} />}
              </dl>
              {detail && <Invitations sm={sm} />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">Efectivo</p>
              <dl className="mt-1 space-y-1">
                <ClosingRow k="Fondo de apertura" v={euros(c.openingFloatCents)} />
                {sm && <ClosingRow k="+ Ventas en efectivo" v={euros(sm.byPayment.CASH ?? 0)} />}
                {!!sm?.inCents && <ClosingRow k="+ Entradas" v={euros(sm.inCents)} />}
                {!!sm?.outCents && <ClosingRow k="− Salidas" v={euros(sm.outCents)} />}
                <ClosingRow k="Contado al cerrar" v={euros(c.countedCashCents)} />
                <ClosingRow k={diff === 0 ? "Cuadre perfecto" : diff > 0 ? "Sobra en el día" : "Descuadre del día"} v={diff === 0 ? "✓" : euros(Math.abs(diff))} strong />
              </dl>
              <p className="mt-2 text-xs text-[var(--p-muted)]">
                Abrió {c.openedByName ?? "—"} a las {hhmm(c.openedAt)} · cerró {c.closedByName ?? "—"} a las {hhmm(c.closedAt)}
              </p>
            </div>
          </div>
          {c.notes && shifts.length === 0 && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">Nota: {c.notes}</p>}
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => onPrint(false)} className="inline-flex min-h-11 items-center rounded-full bg-[var(--p-surface)] px-4 text-xs font-semibold ring-1 ring-[var(--p-line)]">
              🖨 Imprimir resumen
            </button>
            <button type="button" onClick={() => onPrint(true)} className="inline-flex min-h-11 items-center rounded-full bg-[var(--p-surface)] px-4 text-xs font-semibold ring-1 ring-[var(--p-line)]">
              🖨 Imprimir detallado
            </button>
            <button type="button" onClick={onPrintHere} className="inline-flex min-h-11 items-center rounded-full bg-[var(--p-surface)] px-4 text-xs font-semibold ring-1 ring-[var(--p-line)]">
              🖨 En este ordenador
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
