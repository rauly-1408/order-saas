"use client";

import { ask } from "@/app/lib/dialog";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import PaidWithChooser, { type PaidWith } from "./PaidWith";
import { discountLines } from "@/app/lib/promotions";
import { scheduledLabel } from "@/app/lib/schedule";
import { DEFAULT_TIMEZONE } from "@/app/lib/time";
import { PROVIDER_NAME, courierCanCancel, courierCanRetry, courierPanelLabel } from "@/app/lib/couriers/labels";
import {
  canCancel,
  elapsedLabel,
  formatPhone,
  modifierLabels,
  nextAction,
  orderLabel,
  PAYMENT_LABEL,
  SOURCE_LABEL,
  timerTone,
  toEuros,
  type Estimates,
  type Order,
  type TimerTone,
} from "./orderBoard";

const TONE_CLS: Record<TimerTone, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  warn: "bg-orange-50 text-orange-700",
  late: "bg-red-50 text-red-600",
};

type OrderCardProps = {
  order: Order;
  estimates: Estimates;
  now: number;
  busy: boolean;
  onStatus: (id: string, status: string, paidWith?: PaidWith) => void;
  courierEnabled?: boolean;
  onCourier?: (id: string, action: "request" | "cancel") => void;
  printingEnabled?: boolean;
  onPrint?: (id: string, kind: "KITCHEN" | "RECEIPT") => void;
  // Arrastrar la tarjeta a la siguiente columna (solo con ratón, en pantallas grandes).
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  // Sube cada vez que, al soltar la tarjeta, hay que preguntar cómo ha pagado.
  payRequest?: number;
};

const COURIER_TONE: Record<string, string> = {
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-black/[0.04] text-[var(--p-muted)]",
  DELIVERED: "bg-emerald-50 text-emerald-700",
};
const SECONDARY = "flex min-h-10 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-black/[0.04] px-2 py-2 text-xs font-medium text-[var(--p-muted)] hover:bg-black/[0.07] hover:text-[var(--p-ink)] disabled:opacity-50";
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : null);

export default function OrderCard({ order, estimates, now, busy, onStatus, courierEnabled = false, onCourier, printingEnabled = false, onPrint, draggable = false, dragging = false, onDragStart, onDragEnd, payRequest = 0 }: OrderCardProps) {
  const action = nextAction(order);
  const { tenant } = useParams<{ tenant: string }>();
  const canPrint = printingEnabled && !!onPrint;
  const secondaryCount = (canPrint ? 2 : 0) + (order.paymentStatus === "PAID" ? 1 : 0) + (canCancel(order) ? 1 : 0);
  // askPay se abre con el botón o cuando sube payRequest (soltar la tarjeta en «Entregado»).
  const [askPayState, setAskPay] = useState<{ open: boolean; seen: number }>({ open: false, seen: 0 });
  const askPay = askPayState.open || askPayState.seen < payRequest;
  // Entregar un pedido pendiente de cobro: primero preguntar cómo ha pagado.
  const needsPay = action?.status === "DELIVERED" && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED";
  const isNew = order.status === "CREATED" || order.status === "ACCEPTED";
  const tone = timerTone(order, estimates, now);

  async function handleCancel() {
    const extra = order.status === "READY" ? " Úsalo si no ha venido a recogerlo: la comida ya está hecha y no vuelve al stock." : "";
    if ((await ask(`¿Cancelar el pedido ${orderLabel(order)} de ${order.customerName}?${extra}`))) {
      onStatus(order.id, "CANCELLED");
    }
  }

  return (
    <article
      draggable={draggable && !busy}
      onDragStart={(e) => {
        if (!draggable || !onDragStart) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", order.id);
        onDragStart(order.id);
      }}
      onDragEnd={onDragEnd}
      title={draggable ? "Arrastra la tarjeta a la siguiente columna o usa el botón" : undefined}
      className={`p-lift rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        isNew ? "ring-2 ring-[var(--p-accent)]" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${dragging ? "opacity-40" : ""}`}
    >
      <header className="mb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xl font-bold tracking-tight text-[var(--p-ink)]">{orderLabel(order)}</span>
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${TONE_CLS[tone]}`}>{elapsedLabel(order.createdAt, now)}</span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-[var(--p-muted)]">
          <span className="whitespace-nowrap">{order.channel === "DELIVERY" ? "🛵 A domicilio" : order.dineIn ? "🍽 Comer aquí" : "🛍 Para recoger"}</span>
          {order.source && SOURCE_LABEL[order.source] && (
            <>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">{SOURCE_LABEL[order.source]}</span>
            </>
          )}
          {order.status === "DELIVERING" && (
            <>
              <span aria-hidden>·</span>
              {/* updatedAt ≈ momento en que salió a reparto (último cambio de estado) */}
              <span className="whitespace-nowrap text-sky-600">en reparto hace {elapsedLabel(order.updatedAt, now)}</span>
            </>
          )}
        </p>
        <div className="mt-2 truncate text-[15px] font-semibold text-[var(--p-ink)]">{order.customerName}</div>
        {order.customerPhone && (
          <a href={`tel:${order.customerPhone}`} className="text-sm text-[var(--p-muted)] hover:text-[var(--p-brand-strong)]">
            {formatPhone(order.customerPhone)}
          </a>
        )}
      </header>

      {/* Programado por el cliente: la hora manda sobre el "hace X min" */}
      {order.scheduledFor && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          ⏰ Programado: {scheduledLabel(order.scheduledFor, new Date(now), DEFAULT_TIMEZONE)}
        </p>
      )}

      <ul className="mb-3 space-y-1 text-sm">
        {order.items.map((item) => {
          const mods = modifierLabels(item.modifiers);
          return (
            <li key={item.id} className="text-[var(--p-ink)]">
              <div className="flex justify-between gap-2">
                <span>
                  <span className="font-bold">{item.quantity}×</span> {item.productName}
                </span>
                <span className="text-[var(--p-muted)]">{toEuros(item.totalCents)}</span>
              </div>
              {mods.length > 0 && <div className="pl-6 text-xs text-[var(--p-muted)]">{mods.join(" · ")}</div>}
              {item.note && <div className="pl-6 text-xs font-semibold text-[var(--p-brand)] wrap-anywhere">Nota: {item.note}</div>}
              {(item.discountCents ?? 0) > 0 && <div className="pl-6 text-xs text-[var(--p-muted)]">Descuento −{toEuros(item.discountCents ?? 0)}</div>}
            </li>
          );
        })}
      </ul>

      {order.channel === "DELIVERY" && order.customerAddress && (
        <p className="mb-2 rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-[var(--p-muted)]">{order.customerAddress}</p>
      )}
      {/* Repartidor externo: estado, hora y acciones */}
      {order.channel === "DELIVERY" && order.courier && (
        <div className={`mb-2 rounded-xl px-3 py-2 text-xs ${COURIER_TONE[order.courier.status] ?? "bg-sky-50 text-sky-800"}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="font-semibold">
              🛵 {PROVIDER_NAME[order.courier.provider]} · {courierPanelLabel(order.courier.status)}
            </span>
            {order.courier.feeCents != null && <span className="tabular-nums">{toEuros(order.courier.feeCents)}</span>}
          </div>
          {(order.courier.courierName || order.courier.pickupEta) && order.courier.status !== "DELIVERED" && order.courier.status !== "FAILED" && (
            <div className="mt-0.5">
              {[order.courier.courierName, order.courier.pickupEta && ["REQUESTED", "ASSIGNED"].includes(order.courier.status) && `recoge hacia las ${hhmm(order.courier.pickupEta)}`]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}
          {order.courier.error && <div className="mt-0.5">{order.courier.error}</div>}
          <div className="mt-1 flex flex-wrap gap-3">
            {order.courier.trackingUrl && (
              <a href={order.courier.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Ver en el mapa
              </a>
            )}
            {onCourier && courierCanRetry(order.courier.status) && ["ACCEPTED", "PREPARING", "READY"].includes(order.status) && (
              <button onClick={() => onCourier(order.id, "request")} disabled={busy} className="font-semibold underline disabled:opacity-50">
                Pedir de nuevo
              </button>
            )}
            {onCourier && courierCanCancel(order.courier.status) && (
              <button
                onClick={async () => (await ask("¿Cancelar el repartidor? El pedido sigue activo.")) && onCourier(order.id, "cancel")}
                disabled={busy}
                className="underline disabled:opacity-50"
              >
                Cancelar repartidor
              </button>
            )}
          </div>
        </div>
      )}
      {order.channel === "DELIVERY" && !order.courier && courierEnabled && onCourier && ["PREPARING", "READY", "ACCEPTED"].includes(order.status) && (
        <button onClick={() => onCourier(order.id, "request")} disabled={busy} className="p-press mb-2 w-full rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 disabled:opacity-50">
          🛵 Pedir repartidor
        </button>
      )}
      {!!order.discountCents &&
        discountLines({ ...order, discountCents: order.discountCents }).map((d) => (
          <p key={d.label} className="mb-2 rounded-xl bg-[var(--p-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--p-accent)]">
            {d.label}: −{toEuros(d.cents)}
          </p>
        ))}
      {(!!order.tipCents || !!order.giftCardCents) && (
        <p className="mb-2 flex flex-wrap gap-x-3 rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-[var(--p-muted)]">
          {!!order.tipCents && <span>Propina: {toEuros(order.tipCents)}</span>}
          {!!order.giftCardCents && <span>🎁 Tarjeta regalo: −{toEuros(order.giftCardCents)}</span>}
        </p>
      )}
      {order.notes && (
        <p className="mb-2 rounded-xl bg-[var(--p-warm)] px-3 py-2 text-xs text-[var(--p-brand)] wrap-anywhere">Nota: {order.notes}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-[var(--p-line)] pt-3">
        <span className="text-lg font-bold tabular-nums text-[var(--p-ink)]">{toEuros(order.totalCents)}</span>
        {/* Cobro: pagado (y cómo) o pendiente de cobrar en persona */}
        {order.paymentStatus === "PAID" ? (
          <span className="whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">✓ Pagado{order.paymentMethod ? ` · ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}` : ""}</span>
        ) : order.paymentStatus === "REFUNDED" ? (
          <span className="whitespace-nowrap rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-semibold text-[var(--p-muted)]">Devuelto</span>
        ) : (
          <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{order.channel === "DELIVERY" ? "Cobrar al entregar" : "Cobrar al recoger"}</span>
        )}
      </div>

      {action && askPay && needsPay && (
        <PaidWithChooser
          busy={busy}
          onCancel={() => setAskPay({ open: false, seen: payRequest })}
          onPick={(m) => {
            setAskPay({ open: false, seen: payRequest });
            onStatus(order.id, action.status, m);
          }}
        />
      )}
      {action && !(askPay && needsPay) && (
        <button
          onClick={() => (needsPay ? setAskPay({ open: true, seen: payRequest }) : onStatus(order.id, action.status))}
          disabled={busy}
          className={`p-press mt-3 w-full rounded-full py-3 text-[15px] font-semibold disabled:opacity-50 ${
            isNew ? "bg-[var(--p-accent)] text-white hover:brightness-95" : "bg-[var(--p-brand)] text-white hover:bg-[var(--p-brand-strong)]"
          }`}
        >
          {busy ? "…" : needsPay ? `${action.label} y cobrar` : action.label}
        </button>
      )}

      {/* Acciones secundarias: discretas. Hasta dos en una fila; con más, en
          cuadrícula de dos (si sobra una, ocupa la fila entera) para que nunca
          se salgan de la tarjeta en columnas estrechas. */}
      {secondaryCount > 0 && (
        <div className={`mt-2 grid gap-1.5 ${secondaryCount === 1 ? "grid-cols-1" : "grid-cols-2 [&>*:last-child:nth-child(odd)]:col-span-2"}`}>
          {printingEnabled && onPrint && (
            <>
              <button type="button" onClick={() => onPrint(order.id, "KITCHEN")} disabled={busy} title="Reimprimir la comanda de cocina" className={SECONDARY}>
                <PrinterIcon /> Comanda
              </button>
              <button type="button" onClick={() => onPrint(order.id, "RECEIPT")} disabled={busy} title="Imprimir el ticket del cliente" className={SECONDARY}>
                <PrinterIcon /> Ticket
              </button>
            </>
          )}
          {order.paymentStatus === "PAID" && (
            <Link href={`/admin/${tenant}/facturas?pedido=${order.id}`} title="Factura a nombre del cliente" className={SECONDARY}>
              Factura
            </Link>
          )}
          {canCancel(order) && (
            <button type="button" onClick={handleCancel} disabled={busy} className={`${SECONDARY} hover:!bg-red-50 hover:!text-red-600`}>
              Cancelar
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function PrinterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 8V4h10v4M5 8h14a2 2 0 012 2v6h-4v4H7v-4H3v-6a2 2 0 012-2zM7 15h10" />
    </svg>
  );
}
