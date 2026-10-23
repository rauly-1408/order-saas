"use client";

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
};

const COURIER_TONE: Record<string, string> = {
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-black/[0.04] text-[var(--p-muted)]",
  DELIVERED: "bg-emerald-50 text-emerald-700",
};
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : null);

export default function OrderCard({ order, estimates, now, busy, onStatus, courierEnabled = false, onCourier }: OrderCardProps) {
  const action = nextAction(order);
  const [askPay, setAskPay] = useState(false);
  // Entregar un pedido pendiente de cobro: primero preguntar cómo ha pagado.
  const needsPay = action?.status === "DELIVERED" && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED";
  const isNew = order.status === "CREATED" || order.status === "ACCEPTED";
  const tone = timerTone(order, estimates, now);

  function handleCancel() {
    if (window.confirm(`¿Cancelar el pedido ${orderLabel(order)} de ${order.customerName}?`)) {
      onStatus(order.id, "CANCELLED");
    }
  }

  return (
    <article
      className={`p-lift rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
        isNew ? "ring-2 ring-[var(--p-accent)]" : ""
      }`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-tight text-[var(--p-ink)]">{orderLabel(order)}</span>
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-[var(--p-muted)]">
              {order.channel === "DELIVERY" ? "A domicilio" : order.dineIn ? "Comer aquí" : "Para recoger"}
            </span>
            {order.source && SOURCE_LABEL[order.source] && (
              <span className="rounded-full bg-[var(--p-brand-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-brand)]">{SOURCE_LABEL[order.source]}</span>
            )}
          </div>

          <div className="truncate font-semibold text-[var(--p-ink)]">{order.customerName}</div>
          <a href={`tel:${order.customerPhone}`} className="text-sm text-[var(--p-muted)] hover:text-[var(--p-brand-strong)]">
            {formatPhone(order.customerPhone)}
          </a>
        </div>
        <div className="shrink-0 text-right">
          <span className={`rounded-full px-2 py-1 text-xs font-bold tabular-nums ${TONE_CLS[tone]}`}>
            {elapsedLabel(order.createdAt, now)}
          </span>
          {/* updatedAt ≈ momento en que salió a reparto (último cambio de estado) */}
          {order.status === "DELIVERING" && (
            <div className="mt-1.5 text-[11px] text-sky-600">en reparto hace {elapsedLabel(order.updatedAt, now)}</div>
          )}
        </div>
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
              {item.note && <div className="pl-6 text-xs font-semibold text-[var(--p-brand)]">Nota: {item.note}</div>}
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
                onClick={() => window.confirm("¿Cancelar el repartidor? El pedido sigue activo.") && onCourier(order.id, "cancel")}
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
        <p className="mb-2 rounded-xl bg-[var(--p-warm)] px-3 py-2 text-xs text-[var(--p-brand)]">Nota: {order.notes}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-[var(--p-ink)]">{toEuros(order.totalCents)}</span>
          {/* Cobro: pagado online o pendiente de cobrar en persona */}
          {order.paymentStatus === "PAID" ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{order.paymentMethod && order.paymentMethod !== "CARD" ? `Pagado · ${PAYMENT_LABEL[order.paymentMethod] ?? order.paymentMethod}` : "💳 Pagado"}</span>
          ) : order.paymentStatus === "REFUNDED" ? (
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-semibold text-[var(--p-muted)]">Devuelto</span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{order.channel === "DELIVERY" ? "Cobrar al entregar" : "Cobrar al recoger"}</span>
          )}
        </span>
        {canCancel(order) && (
          <button
            onClick={handleCancel}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[var(--p-faint)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>

      {action && askPay && needsPay && (
        <PaidWithChooser
          busy={busy}
          onCancel={() => setAskPay(false)}
          onPick={(m) => {
            setAskPay(false);
            onStatus(order.id, action.status, m);
          }}
        />
      )}
      {action && !(askPay && needsPay) && (
        <button
          onClick={() => (needsPay ? setAskPay(true) : onStatus(order.id, action.status))}
          disabled={busy}
          className={`p-press mt-3 w-full rounded-full py-3 text-[15px] font-semibold disabled:opacity-50 ${
            isNew ? "bg-[var(--p-accent)] text-white hover:brightness-95" : "bg-[var(--p-brand)] text-white hover:bg-[var(--p-brand-strong)]"
          }`}
        >
          {busy ? "…" : needsPay ? `${action.label} y cobrar` : action.label}
        </button>
      )}
    </article>
  );
}
