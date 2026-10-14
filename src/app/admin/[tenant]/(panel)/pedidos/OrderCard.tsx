"use client";

import {
  canCancel,
  elapsedLabel,
  formatPhone,
  modifierLabels,
  nextAction,
  orderLabel,
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
  onStatus: (id: string, status: string) => void;
};

export default function OrderCard({ order, estimates, now, busy, onStatus }: OrderCardProps) {
  const action = nextAction(order);
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
              {order.channel === "DELIVERY" ? "A domicilio" : "Para recoger"}
            </span>
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
            </li>
          );
        })}
      </ul>

      {order.channel === "DELIVERY" && order.customerAddress && (
        <p className="mb-2 rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-[var(--p-muted)]">{order.customerAddress}</p>
      )}
      {!!order.discountCents && (
        <p className="mb-2 rounded-xl bg-[var(--p-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--p-accent)]">
          Cupón {order.coupon?.code ?? ""}: −{toEuros(order.discountCents)}
        </p>
      )}
      {order.notes && (
        <p className="mb-2 rounded-xl bg-[var(--p-warm)] px-3 py-2 text-xs text-[var(--p-brand)]">Nota: {order.notes}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-bold text-[var(--p-ink)]">{toEuros(order.totalCents)}</span>
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

      {action && (
        <button
          onClick={() => onStatus(order.id, action.status)}
          disabled={busy}
          className={`p-press mt-3 w-full rounded-full py-3 text-[15px] font-semibold disabled:opacity-50 ${
            isNew ? "bg-[var(--p-accent)] text-white hover:brightness-95" : "bg-[var(--p-brand)] text-white hover:bg-[var(--p-brand-strong)]"
          }`}
        >
          {busy ? "…" : action.label}
        </button>
      )}
    </article>
  );
}
