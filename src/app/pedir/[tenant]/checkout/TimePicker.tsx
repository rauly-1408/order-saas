"use client";

import { useEffect, useMemo, useRef } from "react";
import { slotDay, ui, type Lang } from "@/app/lib/i18n";

// Día y hora para programar el pedido. El día son tres botones (Hoy · Mañana ·
// siguiente) y la hora, una rueda a la vista como la de la alarma del iPhone:
// dos columnas (hora · minutos), la fila del centro es la elegida y se desliza
// con el dedo o con la rueda del ratón. Solo ofrece horas válidas (las calcula
// el servidor): al cambiar la hora, los minutos son los que valen para esa hora.

type Slot = { at: string; day: string; time: string };

const ITEM = 44; // alto de cada fila (px)
const VISIBLE = 7; // filas visibles (impar: la del centro es la elegida)
const PAD = Math.floor(VISIBLE / 2);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function Wheel({ items, index, onPick, label }: { items: string[]; index: number; onPick: (i: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settling = useRef(false);

  // Lleva la rueda a la opción elegida (al abrir o cuando cambia la otra rueda).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Math.round(el.scrollTop / ITEM) !== index) {
      settling.current = true;
      el.scrollTo({ top: index * ITEM, behavior: "smooth" });
      const t = setTimeout(() => (settling.current = false), 400);
      return () => clearTimeout(t);
    }
  }, [index, items]);

  function onScroll() {
    if (settling.current) return;
    if (timer.current) clearTimeout(timer.current);
    // Cuando el dedo para, vale la fila que ha quedado en el centro.
    timer.current = setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM)));
      if (i !== index) onPick(i);
    }, 80);
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={label}
      aria-activedescendant={`${label}-${index}`}
      tabIndex={0}
      onKeyDown={(e) => {
        const next = e.key === "ArrowDown" ? index + 1 : e.key === "ArrowUp" ? index - 1 : -1;
        if (next < 0 || next >= items.length) return;
        e.preventDefault();
        onPick(next);
      }}
      className="relative flex-1 snap-y snap-mandatory overflow-y-scroll overscroll-contain outline-none"
      style={{
        height: ITEM * VISIBLE,
        scrollbarWidth: "none",
        maskImage: "linear-gradient(transparent, black 22%, black 78%, transparent)",
        WebkitMaskImage: "linear-gradient(transparent, black 22%, black 78%, transparent)",
      }}
    >
      <div style={{ height: ITEM * PAD }} />
      {items.map((it, i) => {
        const d = Math.abs(i - index);
        return (
          <button
            key={`${it}-${i}`}
            id={`${label}-${i}`}
            type="button"
            role="option"
            aria-selected={i === index}
            onClick={() => onPick(i)}
            className="flex w-full snap-center items-center justify-center tabular-nums transition-[opacity,transform,color] duration-200"
            style={{
              height: ITEM,
              fontSize: 28,
              fontWeight: i === index ? 600 : 400,
              color: "var(--text-primary)",
              opacity: i === index ? 1 : Math.max(0.18, 0.55 - (d - 1) * 0.14),
              transform: `scale(${i === index ? 1 : Math.max(0.84, 1 - d * 0.05)})`,
            }}
          >
            {it}
          </button>
        );
      })}
      <div style={{ height: ITEM * PAD }} />
    </div>
  );
}

export default function TimePicker({ slots, value, onChange, lang }: { slots: Slot[]; value: string | null; onChange: (at: string) => void; lang: Lang }) {
  const T = ui(lang);
  const current = slots.find((s) => s.at === value) ?? slots[0];
  const days = useMemo(() => [...new Set(slots.map((s) => s.day))], [slots]);
  const ofDay = useMemo(() => slots.filter((s) => s.day === current?.day), [slots, current?.day]);
  const hours = useMemo(() => [...new Set(ofDay.map((s) => s.time.slice(0, 2)))], [ofDay]);
  const hourIdx = Math.max(0, hours.indexOf(current?.time.slice(0, 2) ?? ""));
  const ofHour = useMemo(() => ofDay.filter((s) => s.time.slice(0, 2) === hours[hourIdx]), [ofDay, hours, hourIdx]);
  const minutes = useMemo(() => ofHour.map((s) => s.time.slice(3)), [ofHour]);
  const minIdx = Math.max(0, minutes.indexOf(current?.time.slice(3) ?? ""));
  if (!current) return null;
  const first = ofDay[0]?.time ?? current.time;
  const last = ofDay[ofDay.length - 1]?.time ?? current.time;

  // Al cambiar el día o la hora se intenta conservar lo elegido en lo demás.
  const pickDay = (day: string) => onChange(nearest(slots.filter((s) => s.day === day), current.time).at);
  const pickHour = (i: number) => {
    const list = ofDay.filter((s) => s.time.slice(0, 2) === hours[i]);
    onChange((list.find((s) => s.time.slice(3) === current.time.slice(3)) ?? nearest(list, `${hours[i]}:${current.time.slice(3)}`)).at);
  };
  const pickMinute = (i: number) => onChange(ofHour[i].at);

  return (
    <div>
      <div role="radiogroup" aria-label={lang === "en" ? "Day" : "Día"} style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
        {days.map((d) => {
          const on = d === current.day;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickDay(d)}
              style={{
                flex: 1,
                padding: "10px 6px",
                borderRadius: "12px",
                border: `2px solid ${on ? "var(--brand-accent)" : "var(--border)"}`,
                backgroundColor: on ? "color-mix(in srgb, var(--brand-accent) 10%, transparent)" : "transparent",
                color: on ? "var(--brand-accent)" : "var(--text-secondary)",
                fontWeight: on ? 700 : 400,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              {slotDay(d, lang)}
            </button>
          );
        })}
      </div>

      {/* Rueda: hora · minutos. La banda del centro marca la elegida. */}
      <div className="relative flex items-center rounded-2xl px-3" style={{ backgroundColor: "var(--surface-0)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl" style={{ height: ITEM, backgroundColor: "color-mix(in srgb, var(--text-primary) 9%, transparent)" }} />
        <Wheel items={hours} index={hourIdx} onPick={pickHour} label={lang === "en" ? "Hour" : "Hora"} />
        <span aria-hidden className="relative pb-1 text-[26px] font-semibold" style={{ color: "var(--text-primary)" }}>
          :
        </span>
        <Wheel items={minutes} index={minIdx} onPick={pickMinute} label={lang === "en" ? "Minutes" : "Minutos"} />
      </div>
      <p style={{ margin: "8px 0 0", fontSize: "12px", color: "var(--text-secondary)" }}>{T.timeRange(first, last)}</p>
    </div>
  );
}

// El hueco de la lista cuya hora está más cerca de la pedida.
function nearest(list: Slot[], time: string): Slot {
  const want = toMin(time);
  return list.reduce((best, s) => (Math.abs(toMin(s.time) - want) < Math.abs(toMin(best.time) - want) ? s : best), list[0]);
}
