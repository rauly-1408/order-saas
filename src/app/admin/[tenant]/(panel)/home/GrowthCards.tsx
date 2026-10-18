"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import type { CardArt, GrowthCard, Insight } from "./cards";

// Tarjetas del Inicio: ideas para personalizar la tienda (estilo Shopify).
// Cada una se puede cerrar con ✕ (se recuerda en este navegador).
// Ver docs/INICIO.md

const FIRST = 6;
const storageKey = (tenant: string) => `inicio-ocultas:${tenant}`;

// Tarjetas cerradas, leídas de localStorage sin desajustes al hidratar.
const listeners = new Set<() => void>();
function readHidden(tenant: string): string {
  try {
    return localStorage.getItem(storageKey(tenant)) ?? "";
  } catch {
    return "";
  }
}
function useHidden(tenant: string) {
  const raw = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readHidden(tenant),
    () => ""
  );
  const hidden = new Set(raw ? raw.split(",") : []);
  const write = (next: Set<string>) => {
    try {
      localStorage.setItem(storageKey(tenant), [...next].join(","));
    } catch {}
    listeners.forEach((l) => l());
  };
  return {
    hidden,
    hide: (id: string) => write(new Set([...hidden, id])),
    reset: () => write(new Set()),
  };
}

export default function GrowthCards({ tenant, cards, total, insight }: { tenant: string; cards: GrowthCard[]; total: number; insight: Insight | null }) {
  const { hidden, hide, reset } = useHidden(tenant);
  const [all, setAll] = useState(false);
  const visible = cards.filter((c) => !hidden.has(c.id));
  const shown = all ? visible : visible.slice(0, FIRST);
  const done = total - cards.length;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-xl font-semibold">Haz tuya tu tienda</h2>
          <p className="text-sm text-[var(--p-muted)]">
            {cards.length === 0 ? "Has activado todo. ¡Tu tienda está completa!" : `${done} de ${total} cosas hechas. Ideas para vender más:`}
          </p>
        </div>
        {hidden.size > 0 && cards.some((c) => hidden.has(c.id)) && (
          <button type="button" onClick={reset} className="text-sm font-medium text-[var(--p-brand)] hover:underline">
            Mostrar las ocultas
          </button>
        )}
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-black/[0.06]" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Tienda personalizada">
        <div className="h-full rounded-full bg-[var(--p-brand)] transition-[width] duration-700" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {insight && <InsightCard tenant={tenant} insight={insight} />}
        {shown.map((c, i) => (
          // p-rise va en el envoltorio: su animación fija el transform y anularía el hover.
          <div key={c.id} className="p-rise" style={{ "--i": i } as React.CSSProperties}>
            <article className="group p-lift relative flex h-full flex-col overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
            <button
              type="button"
              onClick={() => hide(c.id)}
              aria-label={`Ocultar «${c.title}»`}
              title="Ocultar"
              className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-[var(--p-muted)] backdrop-blur hover:bg-white hover:text-[var(--p-text,#111)]"
            >
              ✕
            </button>
            <div className="flex h-32 items-center justify-center overflow-hidden bg-[var(--p-warm)]" aria-hidden>
              <div className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:transform-none">
                <Art kind={c.art} />
              </div>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h3 className="font-semibold leading-snug">{c.title}</h3>
              <p className="mt-1 flex-1 text-sm text-[var(--p-muted)]">{c.text}</p>
              <Link href={c.href} className="p-press mt-4 self-start rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
                {c.cta}
              </Link>
            </div>
            </article>
          </div>
        ))}
      </div>

      {visible.length > FIRST && (
        <div className="mt-4 text-center">
          <button type="button" onClick={() => setAll(!all)} className="p-press rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-5 py-2 text-sm font-medium">
            {all ? "Ver menos" : `Ver ${visible.length - FIRST} ideas más`}
          </button>
        </div>
      )}
    </section>
  );
}

// «Las ventas de X aumentaron»: el producto estrella de la semana con su línea diaria.
function InsightCard({ tenant, insight }: { tenant: string; insight: Insight }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 280;
  const H = 96;
  const pad = 8;
  const max = Math.max(...insight.daily.map((d) => d.units), 1);
  const x = (i: number) => pad + (i * (W - pad * 2)) / (insight.daily.length - 1);
  const y = (u: number) => H - pad - (u / max) * (H - pad * 2);
  const path = insight.daily.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.units).toFixed(1)}`).join(" ");
  const last = insight.daily.length - 1;
  const at = hover ?? last;
  const up = insight.growthPct !== null && insight.growthPct > 0;

  return (
    <div className="p-rise sm:col-span-2 lg:col-span-1">
    <article className="p-lift flex h-full flex-col overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="p-5 pb-0">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--p-faint)]">Tu producto estrella · 7 días</p>
        <h3 className="mt-1 font-semibold leading-snug">
          {insight.name}: {insight.units} {insight.units === 1 ? "vendido" : "vendidos"}
        </h3>
        <p className="mt-1 text-sm text-[var(--p-muted)]">
          {insight.growthPct === null
            ? "La semana anterior no se vendió. ¿Lo destacas en la carta?"
            : up
              ? `▲ ${insight.growthPct} % más que la semana anterior. Destácalo para vender aún más.`
              : insight.growthPct === 0
                ? "Igual que la semana anterior."
                : `▼ ${Math.abs(insight.growthPct)} % menos que la semana anterior. Una promoción puede ayudar.`}
        </p>
      </div>
      <div className="relative px-3 pt-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-24 w-full" role="img" aria-label={`Unidades por día: ${insight.daily.map((d) => `${d.label} ${d.units}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
          <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="currentColor" strokeOpacity={0.12} />
          <path d={path} fill="none" stroke="var(--p-brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1={x(at)} x2={x(at)} y1={pad} y2={H - pad} stroke="currentColor" strokeOpacity={hover === null ? 0 : 0.2} />
          <circle cx={x(at)} cy={y(insight.daily[at].units)} r={4.5} fill="var(--p-brand)" stroke="var(--p-surface)" strokeWidth={2} />
          {insight.daily.map((d, i) => (
            <rect key={i} x={x(i) - (W - pad * 2) / 12} y={0} width={(W - pad * 2) / 6} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </svg>
        <div className="flex justify-between px-1 pb-1 text-[11px] text-[var(--p-faint)]">
          {insight.daily.map((d, i) => (
            <span key={i} className={i === at ? "font-semibold text-[var(--p-muted)]" : ""}>
              {d.label}
            </span>
          ))}
        </div>
        <p className="px-1 text-xs text-[var(--p-muted)]" aria-live="polite">
          {insight.daily[at].label}: <b className="tabular-nums">{insight.daily[at].units}</b> {insight.daily[at].units === 1 ? "unidad" : "unidades"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 p-5 pt-3">
        <Link href={`/admin/${tenant}/carta`} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
          Destacar en la carta
        </Link>
        <Link href={`/admin/${tenant}/informes`} className="p-press rounded-full border border-[var(--p-line)] px-4 py-2 text-sm font-medium">
          Ver informes
        </Link>
      </div>
    </article>
    </div>
  );
}

// Mini-ilustraciones hechas con CSS, con los colores del panel.
const box = "rounded-xl bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]";
const bar = (w: string, c = "bg-black/10") => <span className={`block h-1.5 rounded-full ${c} ${w}`} />;

function Art({ kind }: { kind: CardArt }) {
  switch (kind) {
    case "payments":
      return (
        <div className="flex items-center gap-3">
          <div className="h-14 w-24 rotate-[-6deg] rounded-xl bg-[var(--p-brand)] p-2 shadow-lg">
            <span className="block h-2.5 w-4 rounded-sm bg-amber-300" />
            <span className="mt-4 block h-1 w-14 rounded-full bg-white/60" />
          </div>
          <div className={`${box} px-3 py-2 text-xs font-bold text-sky-600`}>bizum</div>
        </div>
      );
    case "brand":
      return (
        <div className={`${box} w-40 overflow-hidden`}>
          <div className="h-8 bg-[var(--p-brand)]" />
          <div className="-mt-4 ml-3 h-8 w-8 rounded-full border-2 border-white bg-[var(--p-accent)]" />
          <div className="space-y-1.5 p-3 pt-2">
            {bar("w-20")}
            <div className="flex gap-1.5">
              {["bg-[var(--p-brand)]", "bg-[var(--p-accent)]", "bg-amber-300", "bg-emerald-400"].map((c) => (
                <span key={c} className={`h-3 w-3 rounded-full ${c}`} />
              ))}
            </div>
          </div>
        </div>
      );
    case "photos":
      return (
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${box} h-16 w-14 p-1.5 ${i === 1 ? "-translate-y-2" : ""}`}>
              <div className={`h-9 rounded-md ${i === 2 ? "border-2 border-dashed border-black/15 bg-transparent" : "bg-[var(--p-brand-soft)]"}`}>
                {i === 2 && <span className="flex h-full items-center justify-center text-sm text-black/30">+</span>}
              </div>
              <span className="mt-1.5 block">{bar("w-8")}</span>
            </div>
          ))}
        </div>
      );
    case "english":
      return (
        <div className="flex items-center gap-2">
          <div className={`${box} px-3 py-2 text-sm font-semibold`}>Mollete</div>
          <span className="text-[var(--p-muted)]">→</span>
          <div className={`${box} px-3 py-2 text-sm font-semibold text-[var(--p-brand)]`}>Mollete 🇬🇧</div>
        </div>
      );
    case "delivery":
      return (
        <div className="relative h-20 w-44">
          <svg viewBox="0 0 176 80" className="absolute inset-0" aria-hidden>
            <path d="M16 64 C 60 64, 70 16, 160 16" fill="none" stroke="var(--p-brand)" strokeWidth="2" strokeDasharray="5 5" />
          </svg>
          <span className="absolute bottom-2 left-0 text-2xl">🏪</span>
          <span className="absolute left-[72px] top-5 text-2xl">🛵</span>
          <span className="absolute right-0 top-0 text-2xl">🏠</span>
        </div>
      );
    case "combos":
      return (
        <div className={`${box} flex items-center gap-2 px-4 py-3 text-2xl`}>
          🥪<span className="text-sm text-[var(--p-muted)]">+</span>🥤<span className="text-sm text-[var(--p-muted)]">+</span>🍟
          <span className="ml-1 rounded-full bg-[var(--p-brand)] px-2 py-0.5 text-xs font-semibold text-white">9,90 €</span>
        </div>
      );
    case "loyalty":
      return (
        <div className={`${box} w-40 p-3`}>
          {bar("w-16")}
          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className={`flex aspect-square items-center justify-center rounded-full text-[10px] ${i < 3 ? "bg-[var(--p-brand)] text-white" : i === 4 ? "bg-amber-300" : "border border-dashed border-black/20"}`}>
                {i < 3 ? "✓" : i === 4 ? "🎁" : ""}
              </span>
            ))}
          </div>
        </div>
      );
    case "promo":
      return (
        <div className="rotate-[-4deg] rounded-xl border-2 border-dashed border-[var(--p-accent)] bg-white px-5 py-3 text-center shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
          <p className="text-2xl font-bold text-[var(--p-accent)]">-10 %</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--p-muted)]">los martes</p>
        </div>
      );
    case "giftcard":
      return (
        <div className="relative h-16 w-28 rotate-[4deg] rounded-xl bg-[var(--p-accent)] p-2.5 text-white shadow-lg">
          <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">Tarjeta regalo</span>
          <p className="mt-1 text-lg font-bold">25 €</p>
          <span className="absolute right-2 top-2 text-sm">🎁</span>
        </div>
      );
    case "domain":
      return (
        <div className={`${box} w-48 overflow-hidden`}>
          <div className="flex items-center gap-1 bg-black/[0.04] px-2 py-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-black/20" />
            ))}
            <span className="ml-1 flex-1 truncate rounded bg-white px-2 py-0.5 text-[10px] text-[var(--p-muted)]">🔒 pedidos.tulocal.com</span>
          </div>
          <div className="space-y-1.5 p-3">
            {bar("w-24", "bg-[var(--p-brand)]/40")}
            {bar("w-32")}
          </div>
        </div>
      );
    case "team":
      return (
        <div className="flex -space-x-3">
          {["bg-[var(--p-brand)]", "bg-[var(--p-accent)]", "bg-amber-400", "bg-emerald-500"].map((c, i) => (
            <span key={c} className={`flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-[var(--p-warm)] text-sm font-semibold text-white ${c}`}>
              {i === 3 ? "+" : ["T", "C", "S"][i]}
            </span>
          ))}
        </div>
      );
    case "tips":
      return (
        <div className={`${box} p-3`}>
          {bar("w-14")}
          <div className="mt-2 flex gap-1.5 text-xs font-semibold">
            {["5 %", "10 %", "15 %"].map((t, i) => (
              <span key={t} className={`rounded-full px-2.5 py-1 ${i === 1 ? "bg-[var(--p-brand)] text-white" : "border border-black/10"}`}>
                {t}
              </span>
            ))}
          </div>
        </div>
      );
    case "reviews":
      return (
        <div className={`${box} px-4 py-3 text-center`}>
          <p className="text-lg tracking-widest text-amber-400">★★★★★</p>
          <span className="mx-auto mt-1 block">{bar("w-20")}</span>
        </div>
      );
    case "business":
      return (
        <div className={`${box} w-40 space-y-2 p-3`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${i < 2 ? "bg-emerald-500 text-white" : "border border-dashed border-black/25"}`}>{i < 2 ? "✓" : ""}</span>
              {bar(i === 1 ? "w-16" : "w-20")}
            </div>
          ))}
        </div>
      );
  }
}
