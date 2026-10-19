"use client";

import { useMemo, useState } from "react";
import { slotDay, ui, type Lang } from "@/app/lib/i18n";

// Día y hora para programar el pedido. El día son tres botones (Hoy · Mañana ·
// siguiente) y la hora es el selector del propio sistema (<input type="time">):
// en el iPhone abre la rueda nativa de iOS, en Android y ordenador el suyo.
// Si el cliente escribe una hora en la que no se puede, se le pone la más
// cercana disponible y se le avisa. Las horas disponibles las calcula el servidor.

type Slot = { at: string; day: string; time: string };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export default function TimePicker({ slots, value, onChange, lang, inputStyle }: { slots: Slot[]; value: string | null; onChange: (at: string) => void; lang: Lang; inputStyle: React.CSSProperties }) {
  const T = ui(lang);
  const [snapped, setSnapped] = useState<string | null>(null);
  const current = slots.find((s) => s.at === value) ?? slots[0];
  const days = useMemo(() => [...new Set(slots.map((s) => s.day))], [slots]);
  const ofDay = useMemo(() => slots.filter((s) => s.day === current?.day), [slots, current?.day]);
  if (!current) return null;
  const first = ofDay[0]?.time ?? current.time;
  const last = ofDay[ofDay.length - 1]?.time ?? current.time;

  // Al cambiar de día se intenta conservar la misma hora (o la más cercana).
  function pickDay(day: string) {
    const list = slots.filter((s) => s.day === day);
    onChange(nearest(list, current.time).at);
    setSnapped(null);
  }

  function pickTime(time: string) {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    const exact = ofDay.find((s) => s.time === time);
    const chosen = exact ?? nearest(ofDay, time);
    onChange(chosen.at);
    setSnapped(exact ? null : chosen.time);
  }

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
      <input
        type="time"
        value={current.time}
        min={first}
        max={last}
        step={300}
        onChange={(e) => pickTime(e.target.value)}
        aria-label={lang === "en" ? "Time" : "Hora"}
        style={{ ...inputStyle, fontSize: "20px", fontWeight: 600, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
      />
      <p style={{ margin: "8px 0 0", fontSize: "12px", color: snapped ? "var(--brand-accent)" : "var(--text-secondary)" }} aria-live="polite">
        {snapped ? T.timeSnapped(snapped) : T.timeRange(first, last)}
      </p>
    </div>
  );
}

// El hueco del día cuya hora está más cerca de la pedida.
function nearest(list: Slot[], time: string): Slot {
  const want = toMin(time);
  return list.reduce((best, s) => (Math.abs(toMin(s.time) - want) < Math.abs(toMin(best.time) - want) ? s : best), list[0]);
}
