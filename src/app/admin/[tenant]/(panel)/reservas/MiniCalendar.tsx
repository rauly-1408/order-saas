"use client";

import { useState } from "react";

// Calendario de un mes para elegir un día (de min en adelante). Propio, sin el
// selector del navegador: se ve igual en ordenador, móvil y tablets antiguas.
// Ver docs/RESERVAS.md
const WEEK = ["L", "M", "X", "J", "V", "S", "D"];
const ymdOf = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default function MiniCalendar({ value, min, onPick, counts }: { value: string | null; min: string; onPick: (ymd: string) => void; counts?: Record<string, number> }) {
  const start = value && value >= min ? value : min;
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const first = new Date(Date.UTC(view.y, view.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // lunes primero
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const title = first.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const canBack = ymdOf(view.y, view.m, 1) > min;
  const move = (n: number) => setView((v) => ({ y: v.y + Math.floor((v.m + n) / 12), m: (((v.m + n) % 12) + 12) % 12 }));
  return (
    <div className="w-full max-w-sm select-none">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button type="button" onClick={() => move(-1)} disabled={!canBack} aria-label="Mes anterior" className="p-press h-11 w-11 rounded-full text-xl font-semibold disabled:opacity-25">‹</button>
        <p className="text-base font-semibold first-letter:uppercase">{title}</p>
        <button type="button" onClick={() => move(1)} aria-label="Mes siguiente" className="p-press h-11 w-11 rounded-full text-xl font-semibold">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[var(--p-muted)]">
        {WEEK.map((w) => <span key={w} className="py-1">{w}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const ymd = ymdOf(view.y, view.m, i + 1);
          const off = ymd < min;
          const on = ymd === value;
          const n = counts?.[ymd] ?? 0;
          return (
            <button
              key={ymd}
              type="button"
              disabled={off}
              onClick={() => onPick(ymd)}
              aria-pressed={on}
              aria-label={`${i + 1}${n ? `, ${n} reservas` : ""}`}
              className={`p-press relative flex h-11 items-center justify-center rounded-xl text-sm font-semibold tabular-nums disabled:opacity-25 ${on ? "bg-[var(--p-brand)] text-white" : "hover:bg-black/[0.05]"}`}
            >
              {i + 1}
              {n > 0 && <span aria-hidden className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${on ? "bg-white" : "bg-[var(--p-brand)]"}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
