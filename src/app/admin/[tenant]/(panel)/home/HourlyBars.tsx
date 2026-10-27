"use client";

import { useState } from "react";

// Ventas de hoy por horas: barras finas en la cabecera del Inicio. Al pasar el
// dedo o el ratón por una hora se ve su detalle; sin hover, la hora punta.
export type HourBucket = { hour: number; orders: number; cents: number };

const euros = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export default function HourlyBars({ buckets, nowHour, money }: { buckets: HourBucket[]; nowHour: number; money: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const value = (b: HourBucket) => (money ? b.cents : b.orders);
  const max = Math.max(...buckets.map(value), 1);
  const total = buckets.reduce((s, b) => s + b.orders, 0);
  const peak = buckets.reduce((p, b) => (value(b) > value(p) ? b : p), buckets[0]);
  const shown = hover !== null ? buckets[hover] : total ? peak : null;

  return (
    <div className="flex w-full flex-col">
      <p className="mb-2 min-h-5 text-xs text-[var(--p-brand)]/70" aria-live="polite">
        {shown ? (
          <>
            {hover === null && "Hora punta · "}
            <b className="font-semibold text-[var(--p-brand)]">{String(shown.hour).padStart(2, "0")}:00</b>
            {" · "}
            {shown.orders} {shown.orders === 1 ? "pedido" : "pedidos"}
            {money && ` · ${euros(shown.cents)}`}
          </>
        ) : (
          "Aún no hay ventas hoy"
        )}
      </p>
      <div className="flex h-20 items-end gap-[3px]" role="img" aria-label={`Pedidos por hora: ${buckets.filter((b) => b.orders).map((b) => `${b.hour}h ${b.orders}`).join(", ") || "ninguno"}`} onMouseLeave={() => setHover(null)}>
        {buckets.map((b, i) => {
          const h = value(b) ? Math.max(8, (value(b) / max) * 100) : 0;
          const future = b.hour > nowHour;
          return (
            <div key={b.hour} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <span
                className={`block w-full rounded-t-[4px] transition-[height,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${hover === i ? "bg-[var(--p-brand)]" : "bg-[var(--p-brand)]/75"}`}
                style={{ height: `${h}%` }}
              />
              {/* Línea base: las horas que aún no han llegado, más suaves */}
              <span className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full ${future ? "bg-[var(--p-brand)]/10" : "bg-[var(--p-brand)]/25"}`} />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-[var(--p-brand)]/60">
        <span>{String(buckets[0].hour).padStart(2, "0")}h</span>
        <span>{String(buckets[Math.floor(buckets.length / 2)].hour).padStart(2, "0")}h</span>
        <span>{String(buckets[buckets.length - 1].hour).padStart(2, "0")}h</span>
      </div>
    </div>
  );
}
