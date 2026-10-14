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
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        isNew ? "border-amber-400 ring-2 ring-amber-200" : "border-[#eaeaf4]"
      }`}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-extrabold text-[#393659]">{orderLabel(order)}</span>
            <span className="rounded-md bg-[#f7f7fb] px-1.5 py-0.5 text-[11px] font-medium text-[#6b6890]">
              {order.channel === "DELIVERY" ? "🛵 Delivery" : "🏪 Recoger"}
            </span>
          </div>
          <div className="truncate font-semibold text-[#393659]">{order.customerName}</div>
          <a href={`tel:${order.customerPhone}`} className="text-sm text-[#6b6890] hover:text-[#5707fd]">
            {formatPhone(order.customerPhone)}
          </a>
        </div>
        <div className="shrink-0 text-right">
          <span className={`rounded-full px-2 py-1 text-xs font-bold tabular-nums ${TONE_CLS[tone]}`}>
            ⏱ {elapsedLabel(order.createdAt, now)}
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
            <li key={item.id} className="text-[#393659]">
              <div className="flex justify-between gap-2">
                <span>
                  <span className="font-bold">{item.quantity}×</span> {item.productName}
                </span>
                <span className="text-[#6b6890]">{toEuros(item.totalCents)}</span>
              </div>
              {mods.length > 0 && <div className="pl-6 text-xs text-[#6b6890]">{mods.join(" · ")}</div>}
            </li>
          );
        })}
      </ul>

      {order.channel === "DELIVERY" && order.customerAddress && (
        <p className="mb-2 rounded-lg bg-[#f7f7fb] px-3 py-2 text-xs text-[#6b6890]">📍 {order.customerAddress}</p>
      )}
      {order.notes && (
        <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">📝 {order.notes}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="font-bold text-[#393659]">{toEuros(order.totalCents)}</span>
        {canCancel(order) && (
          <button
            onClick={handleCancel}
            disabled={busy}
            className="rounded-lg px-2 py-1 text-xs font-medium text-[#b8b6df] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            Cancelar
          </button>
        )}
      </div>

      {action && (
        <button
          onClick={() => onStatus(order.id, action.status)}
          disabled={busy}
          className={`mt-3 w-full rounded-lg py-3 text-sm font-extrabold uppercase tracking-wide transition disabled:opacity-50 ${
            isNew ? "bg-amber-400 text-zinc-950 hover:bg-amber-300" : "bg-[#7939fe] text-white hover:bg-[#5707fd]"
          }`}
        >
          {busy ? "…" : action.label}
        </button>
      )}
    </article>
  );
}
