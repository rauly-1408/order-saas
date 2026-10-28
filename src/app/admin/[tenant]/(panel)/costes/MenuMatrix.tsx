"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QUADRANTS, classifyMenu, type Quadrant } from "@/app/lib/menuEngineering";
import { euros } from "./types";

// «¿Qué platos te convienen?»: ingeniería de menús. Cada plato es un punto:
// a la derecha, los que más se venden; arriba, los que más dejan por unidad.
// Las líneas son la venta «normal» y lo que deja de media la carta.
// Ver docs/MODULO-COSTES.md

type Dish = { id: string; name: string; category: string; profitCents: number };
type Props = { dishes: Dish[]; missing: number; sales: { last7: Record<string, number>; last30: Record<string, number> }; onPick: (id: string) => void };

// Colores por cuadrante (además del nombre y la posición: nunca solo el color).
const COLOR: Record<Quadrant, string> = { star: "#2f9e44", plowhorse: "#e8590c", puzzle: "#1c7ed6", dog: "#868e96" };
const ORDER: Quadrant[] = ["star", "plowhorse", "puzzle", "dog"];

// Platos que se ven de cada grupo antes de «+N más».
const CHIPS_FIRST = 6;

const PAD = { l: 48, r: 12, t: 28, b: 40 };

export default function MenuMatrix({ dishes, missing, sales, onPick }: Props) {
  const [days, setDays] = useState<7 | 30>(30);
  const [cat, setCat] = useState<string>("");
  const [hover, setHover] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<Quadrant>>(new Set());
  const units = days === 7 ? sales.last7 : sales.last30;
  const { items, popularityLine, profitLine } = useMemo(
    () => classifyMenu(dishes.filter((d) => !cat || d.category === cat).map((d) => ({ ...d, units: units[d.id] ?? 0 }))),
    [dishes, cat, units]
  );
  const empty = items.every((i) => i.units === 0);

  // El dibujo mide lo mismo que su caja: así los textos no encogen en el móvil.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);
  const H = Math.round(Math.min(380, Math.max(280, W * 0.6)));
  const categories = useMemo(() => [...new Set(dishes.map((d) => d.category))], [dishes]);

  // Escalas (con un poco de aire para que los puntos no toquen el borde).
  const maxU = Math.max(1, ...items.map((i) => i.units), popularityLine) * 1.1;
  const minP = Math.min(0, ...items.map((i) => i.profitCents));
  const maxP = Math.max(1, ...items.map((i) => i.profitCents), profitLine) * 1.1;
  const x = (u: number) => PAD.l + (u / maxU) * (W - PAD.l - PAD.r);
  const y = (p: number) => H - PAD.b - ((p - minP) / (maxP - minP || 1)) * (H - PAD.t - PAD.b);
  const shown = items.find((i) => i.id === hover);

  if (!dishes.length) return null;

  return (
    <section className="rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5">
      <h2 className="text-[17px] font-semibold">¿Qué platos te convienen?</h2>
      <p className="mt-0.5 text-xs text-[var(--p-muted)]">Cruzamos lo que vendes de cada plato con lo que te deja. A la derecha, los que más se venden; arriba, los que más dejan. Toca un plato para ver su detalle.</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-2 rounded-full bg-[var(--p-bg)] p-0.5 text-xs font-semibold">
          {([7, 30] as const).map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`rounded-full px-3 py-1 ${days === d ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.1)]" : "text-[var(--p-muted)]"}`}>
              {d} días
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {["", ...categories].map((c) => (
            <button key={c || "todas"} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${cat === c ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-bg)] text-[var(--p-muted)] hover:text-[var(--p-ink)]"}`}>
              {c || "Toda la carta"}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="mt-4 rounded-xl bg-[var(--p-bg)] px-4 py-6 text-center text-sm text-[var(--p-muted)]">Todavía no hay ventas {cat ? `de «${cat}» ` : ""}en los últimos {days} días. Cuando entren pedidos, aquí verás qué platos te convienen.</p>
      ) : (
        <>
          {/* Gráfico */}
          <div ref={box} className="relative mt-3">
            <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Platos por ventas y por lo que dejan. ${ORDER.map((q) => `${QUADRANTS[q].name}: ${items.filter((i) => i.quadrant === q).length}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
              {/* Fondo suave de cada cuadrante */}
              <rect x={x(popularityLine)} y={PAD.t} width={W - PAD.r - x(popularityLine)} height={y(profitLine) - PAD.t} fill={COLOR.star} opacity={0.06} />
              <rect x={PAD.l} y={PAD.t} width={x(popularityLine) - PAD.l} height={y(profitLine) - PAD.t} fill={COLOR.puzzle} opacity={0.06} />
              <rect x={x(popularityLine)} y={y(profitLine)} width={W - PAD.r - x(popularityLine)} height={H - PAD.b - y(profitLine)} fill={COLOR.plowhorse} opacity={0.06} />
              {/* Ejes y líneas de referencia */}
              <line x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.15} />
              <line x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.15} />
              <line x1={x(popularityLine)} x2={x(popularityLine)} y1={PAD.t} y2={H - PAD.b} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 4" />
              <line x1={PAD.l} x2={W - PAD.r} y1={y(profitLine)} y2={y(profitLine)} stroke="currentColor" strokeOpacity={0.35} strokeDasharray="4 4" />
              {/* Etiquetas de los ejes */}
              <text x={PAD.l} y={14} fontSize="11" fill="currentColor" opacity={0.6}>Te deja por unidad ↑</text>
              <text x={W - PAD.r} y={H - 10} fontSize="11" fill="currentColor" opacity={0.6} textAnchor="end">Vendidos en {days} días →</text>
              <text x={PAD.l - 6} y={y(profitLine) + 4} fontSize="10" fill="currentColor" opacity={0.55} textAnchor="end">{euros(Math.round(profitLine))}</text>
              <text x={x(popularityLine)} y={H - PAD.b + 14} fontSize="10" fill="currentColor" opacity={0.55} textAnchor="middle">{Math.round(popularityLine)} uds</text>
              {/* Platos */}
              {items.map((i) => (
                <g key={i.id} className="cursor-pointer" onMouseEnter={() => setHover(i.id)} onClick={() => onPick(i.id)}>
                  <circle cx={x(i.units)} cy={y(i.profitCents)} r={14} fill="transparent" />
                  <circle cx={x(i.units)} cy={y(i.profitCents)} r={hover === i.id ? 8 : 6} fill={COLOR[i.quadrant]} stroke="#fff" strokeWidth={2} />
                </g>
              ))}
              {/* Nombres de los cuadrantes */}
              <text x={PAD.l + 8} y={PAD.t + 14} fontSize="12" fontWeight="600" stroke="var(--p-surface)" strokeWidth={4} paintOrder="stroke" className="pointer-events-none" fill={COLOR.puzzle}>Enigmas</text>
              <text x={W - PAD.r - 8} y={PAD.t + 14} fontSize="12" fontWeight="600" stroke="var(--p-surface)" strokeWidth={4} paintOrder="stroke" className="pointer-events-none" fill={COLOR.star} textAnchor="end">Estrellas</text>
              <text x={PAD.l + 8} y={H - PAD.b - 8} fontSize="12" fontWeight="600" stroke="var(--p-surface)" strokeWidth={4} paintOrder="stroke" className="pointer-events-none" fill={COLOR.dog}>Perros</text>
              <text x={W - PAD.r - 8} y={H - PAD.b - 8} fontSize="12" fontWeight="600" stroke="var(--p-surface)" strokeWidth={4} paintOrder="stroke" className="pointer-events-none" fill={COLOR.plowhorse} textAnchor="end">Caballos de tiro</text>
            </svg>
            {shown && (
              <div className="pointer-events-none absolute z-10 w-max max-w-[220px] -translate-x-1/2 -translate-y-full rounded-xl bg-[var(--p-ink)] px-3 py-2 text-xs text-white shadow-lg" style={{ left: Math.min(Math.max(x(shown.units), 110), W - 110), top: y(shown.profitCents) - 12 }}>
                <p className="font-semibold">{shown.name}</p>
                <p className="opacity-80">
                  {shown.units} vendidos · deja {euros(shown.profitCents)} por unidad
                </p>
                <p className="opacity-90">{QUADRANTS[shown.quadrant].name}</p>
              </div>
            )}
          </div>

          {/* Qué hacer con cada grupo */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {ORDER.map((q) => {
              const list = items.filter((i) => i.quadrant === q).sort((a, b) => b.units - a.units);
              return (
                <div key={q} className="rounded-xl border border-[var(--p-line)] p-3">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLOR[q] }} />
                    {QUADRANTS[q].name}
                    <span className="font-normal text-[var(--p-muted)]">· {list.length}</span>
                  </p>
                  <p className="mt-1 text-xs text-[var(--p-muted)]">{QUADRANTS[q].advice}</p>
                  {list.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(expanded.has(q) ? list : list.slice(0, CHIPS_FIRST)).map((i) => (
                        <button key={i.id} type="button" onClick={() => onPick(i.id)} className="p-press rounded-full bg-[var(--p-bg)] px-2.5 py-1 text-xs font-medium hover:bg-black/[0.06]">
                          {i.name} <span className="text-[var(--p-muted)]">· {i.units}</span>
                        </button>
                      ))}
                      {list.length > CHIPS_FIRST && (
                        <button type="button" onClick={() => setExpanded((s) => new Set(s.has(q) ? [...s].filter((x) => x !== q) : [...s, q]))} className="p-press rounded-full px-2.5 py-1 text-xs font-semibold text-[var(--p-brand)] hover:bg-[var(--p-bg)]">
                          {expanded.has(q) ? "Ver menos" : `+${list.length - CHIPS_FIRST} más`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {missing > 0 && <p className="mt-3 text-xs text-[var(--p-muted)]">{missing} {missing === 1 ? "plato no sale" : "platos no salen"} porque no tienen escandallo: no sabemos lo que dejan.</p>}
    </section>
  );
}
