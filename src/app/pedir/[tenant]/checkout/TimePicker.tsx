"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { slotDay, ui, type Lang } from "@/app/lib/i18n";

// Día y hora para programar el pedido. En el checkout se ve un campo con lo
// elegido («Hoy, 20:30»); al tocarlo se abre una hoja como la pantalla «Editar
// alarma» del iPhone: ✕ · título · ✓, los días (Hoy · Mañana · siguiente) y una
// rueda hora · minutos cuya fila del centro es la elegida. Solo ofrece horas
// válidas (las calcula el servidor): al cambiar la hora, los minutos son los que
// valen para esa hora. Nada cambia hasta pulsar ✓.

type Slot = { at: string; day: string; time: string };

const ITEM = 44; // alto de cada fila (px)
const VISIBLE = 5; // filas visibles (impar: la del centro es la elegida)
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
        perspective: 600, // efecto de tambor: las filas lejanas se inclinan
        maskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)",
        WebkitMaskImage: "linear-gradient(transparent, black 30%, black 70%, transparent)",
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
            className="flex w-full snap-center items-center justify-center tabular-nums outline-none transition-[opacity,transform,color] duration-200"
            style={{
              height: ITEM,
              fontSize: 28,
              fontWeight: i === index ? 600 : 400,
              color: "var(--text-primary)",
              opacity: i === index ? 1 : Math.max(0.22, 0.6 - (d - 1) * 0.18),
              // Las filas se inclinan como en un tambor y se alejan del centro.
              transform: i === index ? "none" : `rotateX(${(i - index) * -24}deg) scale(${Math.max(0.82, 1 - d * 0.06)})`,
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

// El hueco de la lista cuya hora está más cerca de la pedida.
function nearest(list: Slot[], time: string): Slot {
  const want = toMin(time);
  return list.reduce((best, s) => (Math.abs(toMin(s.time) - want) < Math.abs(toMin(best.time) - want) ? s : best), list[0]);
}

// Días + rueda. Trabaja sobre un borrador: lo elegido solo se aplica con ✓.
function Panel({ slots, value, onChange, lang }: { slots: Slot[]; value: string; onChange: (at: string) => void; lang: Lang }) {
  const T = ui(lang);
  const current = slots.find((s) => s.at === value) ?? slots[0];
  const days = useMemo(() => [...new Set(slots.map((s) => s.day))], [slots]);
  const ofDay = useMemo(() => slots.filter((s) => s.day === current.day), [slots, current.day]);
  const hours = useMemo(() => [...new Set(ofDay.map((s) => s.time.slice(0, 2)))], [ofDay]);
  const hourIdx = Math.max(0, hours.indexOf(current.time.slice(0, 2)));
  const ofHour = useMemo(() => ofDay.filter((s) => s.time.slice(0, 2) === hours[hourIdx]), [ofDay, hours, hourIdx]);
  const minutes = useMemo(() => ofHour.map((s) => s.time.slice(3)), [ofHour]);
  const minIdx = Math.max(0, minutes.indexOf(current.time.slice(3)));
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
      <div role="radiogroup" aria-label={lang === "en" ? "Day" : "Día"} className="mb-3 flex gap-2">
        {days.map((d) => {
          const on = d === current.day;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pickDay(d)}
              className="flex-1 rounded-xl px-1.5 py-2.5 text-[14px] outline-none"
              style={{
                border: `2px solid ${on ? "var(--brand-accent)" : "var(--border)"}`,
                backgroundColor: on ? "color-mix(in srgb, var(--brand-accent) 10%, transparent)" : "transparent",
                color: on ? "var(--brand-accent)" : "var(--text-secondary)",
                fontWeight: on ? 700 : 400,
              }}
            >
              {slotDay(d, lang)}
            </button>
          );
        })}
      </div>

      {/* Rueda: hora · minutos. La banda del centro marca la elegida. */}
      <div className="relative flex items-center rounded-2xl px-3" style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 4%, transparent)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 rounded-xl" style={{ height: ITEM, backgroundColor: "color-mix(in srgb, var(--text-primary) 9%, transparent)" }} />
        <Wheel items={hours} index={hourIdx} onPick={pickHour} label={lang === "en" ? "Hour" : "Hora"} />
        <span aria-hidden className="relative pb-1 text-[26px] font-semibold" style={{ color: "var(--text-primary)" }}>
          :
        </span>
        <Wheel items={minutes} index={minIdx} onPick={pickMinute} label={lang === "en" ? "Minutes" : "Minutos"} />
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {T.timeRange(first, last)}
      </p>
    </div>
  );
}

export default function TimePicker({ slots, value, onChange, lang, title }: { slots: Slot[]; value: string | null; onChange: (at: string) => void; lang: Lang; title: string }) {
  const T = ui(lang);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>("");
  // La hoja se pinta en <body>, fuera de la tienda: se copian sus variables de
  // color y fuente al abrir para que lleve los colores de la marca.
  const [vars, setVars] = useState<React.CSSProperties>({});
  const field = useRef<HTMLButtonElement>(null);
  const current = slots.find((s) => s.at === value) ?? slots[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!current) return null;

  const show = () => {
    if (field.current) {
      const cs = getComputedStyle(field.current);
      const copy: Record<string, string> = {};
      for (const v of ["--surface-0", "--surface-1", "--text-primary", "--text-secondary", "--border", "--brand-accent", "--on-accent", "--font-body"]) copy[v] = cs.getPropertyValue(v);
      setVars({ ...copy, fontFamily: "var(--font-body)" } as React.CSSProperties);
    }
    setDraft(current.at);
    setOpen(true);
  };
  const confirm = () => {
    if (draft) onChange(draft);
    setOpen(false);
  };

  return (
    <>
      {/* Campo con lo elegido: al tocarlo se abre la hoja. */}
      <button
        ref={field}
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        className="p-press flex w-full items-center justify-between rounded-xl px-4 py-3 text-left"
        style={{ border: "1px solid var(--border)", backgroundColor: "var(--surface-1)", color: "var(--text-primary)" }}
      >
        <span className="text-[17px] font-semibold tabular-nums">
          {slotDay(current.day, lang)}, {current.time}
        </span>
        <span className="text-[13px] font-medium" style={{ color: "var(--brand-accent)" }}>
          {T.change}
        </span>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title} style={vars}>
            <button type="button" aria-label={T.cancel} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
            <div className="relative w-full max-w-md rounded-t-[28px] px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px] sm:p-5" style={{ backgroundColor: "var(--surface-1)", color: "var(--text-primary)" }}>
              <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full sm:hidden" style={{ backgroundColor: "color-mix(in srgb, var(--text-secondary) 40%, transparent)" }} />
              {/* Cabecera: ✕ · título · ✓ */}
              <div className="mb-4 flex items-center justify-between">
                <button type="button" onClick={() => setOpen(false)} aria-label={T.cancel} className="p-press flex h-11 w-11 items-center justify-center rounded-full text-[20px]" style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)" }}>
                  ✕
                </button>
                <p className="text-[17px] font-semibold">{title}</p>
                <button type="button" onClick={confirm} aria-label={T.ok} className="p-press flex h-11 w-11 items-center justify-center rounded-full text-[22px] font-bold" style={{ backgroundColor: "var(--brand-accent)", color: "var(--on-accent)" }}>
                  ✓
                </button>
              </div>
              <Panel slots={slots} value={draft || current.at} onChange={setDraft} lang={lang} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
