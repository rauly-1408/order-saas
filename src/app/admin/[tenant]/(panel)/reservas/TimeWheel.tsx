"use client";

import { useEffect, useRef } from "react";

// Reloj como el del despertador del iPhone: dos ruedas (horas y minutos) que se
// deslizan con el dedo o la rueda del ratón y se paran en un número. Solo
// ofrece las horas y minutos en los que el local está abierto. Ver docs/RESERVAS.md
const ITEM = 44; // alto de cada número, en px

function Wheel({ values, value, onChange, label }: { values: number[]; value: number; onChange: (v: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = Math.max(0, values.indexOf(value));
  // Colocar la rueda en el valor elegido (al abrir o si cambia desde fuera).
  useEffect(() => {
    const el = ref.current;
    if (el && Math.abs(el.scrollTop - idx * ITEM) > 2) el.scrollTo({ top: idx * ITEM });
  }, [idx, values.length]);
  return (
    <div className="relative h-[220px] flex-1">
      <div aria-hidden className="pointer-events-none absolute inset-x-1 top-1/2 h-11 -translate-y-1/2 rounded-xl bg-black/[0.06]" />
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM)));
            if (values[i] !== value) onChange(values[i]);
          }, 90);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && idx < values.length - 1) onChange(values[idx + 1]);
          if (e.key === "ArrowUp" && idx > 0) onChange(values[idx - 1]);
        }}
        className="h-full snap-y snap-mandatory overflow-y-scroll py-[88px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ maskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)" }}
      >
        {values.map((v, i) => (
          <div
            key={v}
            role="option"
            aria-selected={i === idx}
            onClick={() => onChange(v)}
            className={`flex h-11 snap-center cursor-pointer items-center justify-center text-2xl tabular-nums transition-colors ${i === idx ? "font-semibold text-[var(--p-ink)]" : "text-[var(--p-faint)]"}`}
          >
            {String(v).padStart(2, "0")}
          </div>
        ))}
      </div>
    </div>
  );
}

// open: minutos del día (0–1439) en los que se puede reservar; value: minuto elegido.
export default function TimeWheel({ open, value, onChange }: { open: number[]; value: number; onChange: (m: number) => void }) {
  const set = new Set(open);
  const hours = [...new Set(open.map((m) => Math.floor(m / 60)))];
  const h = Math.floor(value / 60);
  const minutes = open.filter((m) => Math.floor(m / 60) === h).map((m) => m % 60);
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-black/[0.03] px-3">
      <Wheel
        label="Hora"
        values={hours}
        value={h}
        onChange={(nh) => {
          // Al cambiar la hora se mantienen los minutos si ese momento está abierto.
          const keep = nh * 60 + (value % 60);
          onChange(set.has(keep) ? keep : open.find((m) => Math.floor(m / 60) === nh) ?? value);
        }}
      />
      <span aria-hidden className="text-2xl font-semibold">:</span>
      <Wheel label="Minutos" values={minutes} value={value % 60} onChange={(nm) => onChange(h * 60 + nm)} />
    </div>
  );
}
