"use client";

import { useEffect, useMemo, useRef } from "react";
import { slotDay, type Lang } from "@/app/lib/i18n";

// Selector de hora al estilo del iPhone: tres ruedas (día · hora · minutos)
// que se deslizan con el dedo y se encajan en el centro. Solo ofrece horas en
// las que el local puede preparar el pedido (las calcula el servidor).

type Slot = { at: string; day: string; time: string };
const ITEM = 40; // alto de cada fila (px)
const VISIBLE = 5; // filas visibles: la del centro es la elegida

function Wheel({ items, index, onPick, label, width }: { items: string[]; index: number; onPick: (i: number) => void; label: string; width: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settling = useRef(false);

  // Lleva la rueda a la opción elegida (al abrir o cuando cambia otra rueda).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Math.round(el.scrollTop / ITEM) !== index) {
      settling.current = true;
      el.scrollTo({ top: index * ITEM, behavior: "smooth" });
      setTimeout(() => (settling.current = false), 350);
    }
  }, [index, items.length]);

  function onScroll() {
    if (settling.current) return;
    if (timer.current) clearTimeout(timer.current);
    // Cuando el dedo para, se elige la fila que ha quedado en el centro.
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onPick(i);
    }, 90);
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        const next = e.key === "ArrowDown" ? index + 1 : e.key === "ArrowUp" ? index - 1 : -1;
        if (next < 0 || next >= items.length) return;
        e.preventDefault();
        onPick(next);
      }}
      className={`relative snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none ${width}`}
      style={{ height: ITEM * VISIBLE, scrollbarWidth: "none", maskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)", WebkitMaskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)" }}
    >
      <div style={{ height: ITEM * Math.floor(VISIBLE / 2) }} />
      {items.map((it, i) => (
        <button
          key={`${it}-${i}`}
          type="button"
          role="option"
          aria-selected={i === index}
          onClick={() => onPick(i)}
          className={`flex w-full snap-center items-center justify-center text-[19px] tabular-nums transition-[opacity,transform] duration-200 ${i === index ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)] opacity-60"}`}
          style={{ height: ITEM, transform: i === index ? "scale(1.04)" : `scale(${Math.max(0.86, 1 - Math.abs(i - index) * 0.07)})` }}
        >
          {it}
        </button>
      ))}
      <div style={{ height: ITEM * Math.floor(VISIBLE / 2) }} />
    </div>
  );
}

export default function TimeWheel({ slots, value, onChange, lang }: { slots: Slot[]; value: string | null; onChange: (at: string) => void; lang: Lang }) {
  const current = slots.find((s) => s.at === value) ?? slots[0];
  const days = useMemo(() => [...new Set(slots.map((s) => s.day))], [slots]);
  const dayIdx = Math.max(0, days.indexOf(current?.day));
  const ofDay = useMemo(() => slots.filter((s) => s.day === days[dayIdx]), [slots, days, dayIdx]);
  const hours = useMemo(() => [...new Set(ofDay.map((s) => s.time.slice(0, 2)))], [ofDay]);
  const hourIdx = Math.max(0, hours.indexOf(current?.time.slice(0, 2)));
  const ofHour = useMemo(() => ofDay.filter((s) => s.time.slice(0, 2) === hours[hourIdx]), [ofDay, hours, hourIdx]);
  const minutes = ofHour.map((s) => s.time.slice(3));
  const minIdx = Math.max(0, minutes.indexOf(current?.time.slice(3)));

  if (!current) return null;

  // Al cambiar una rueda se intenta conservar lo elegido en las demás.
  const pickDay = (i: number) => {
    const list = slots.filter((s) => s.day === days[i]);
    onChange((list.find((s) => s.time === current.time) ?? list.find((s) => s.time.slice(0, 2) === current.time.slice(0, 2)) ?? list[0]).at);
  };
  const pickHour = (i: number) => {
    const list = ofDay.filter((s) => s.time.slice(0, 2) === hours[i]);
    onChange((list.find((s) => s.time.slice(3) === current.time.slice(3)) ?? list[0]).at);
  };
  const pickMinute = (i: number) => onChange(ofHour[i].at);

  return (
    <div className="relative flex items-center justify-center gap-1 rounded-2xl bg-[var(--surface-0)] px-2 py-1">
      {/* Banda del centro: la selección */}
      <div aria-hidden className="pointer-events-none absolute inset-x-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-[color-mix(in_srgb,var(--brand-accent)_10%,transparent)]" />
      <Wheel items={days.map((d) => slotDay(d, lang))} index={dayIdx} onPick={pickDay} label={lang === "en" ? "Day" : "Día"} width="flex-[1.6]" />
      <Wheel items={hours} index={hourIdx} onPick={pickHour} label={lang === "en" ? "Hour" : "Hora"} width="flex-1" />
      <span aria-hidden className="relative text-[19px] font-semibold text-[var(--text-primary)]">:</span>
      <Wheel items={minutes} index={minIdx} onPick={pickMinute} label={lang === "en" ? "Minutes" : "Minutos"} width="flex-1" />
    </div>
  );
}
