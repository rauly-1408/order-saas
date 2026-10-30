"use client";

import { useState } from "react";
import { Sheet, euros, minutesSince, type Fixture, type Table } from "./shared";

// La sala en servicio: resumen arriba, filtros, el plano con las mesas dibujadas
// (sillas por plaza, comensales, tiempo con color y camarero) y, al lado, la
// lista de mesas abiertas con la ficha de la mesa elegida y sus acciones.
// En el móvil la ficha sale desde abajo. Ver docs/MESAS.md

export type QuickAction = "view" | "round" | "pay" | "bill";
type Filter = "all" | "free" | "busy" | "bill";

const mins = (iso: string, now: number) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
// Tiempo de la mesa: verde hasta 45 min, ámbar hasta 90, rojo después.
function timeTone(m: number): string {
  if (m >= 90) return "bg-red-500 text-white";
  if (m >= 45) return "bg-amber-400 text-amber-950";
  return "bg-emerald-500 text-white";
}
const initials = (name: string | null) =>
  (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

// Sillas alrededor de una mesa cuadrada según las plazas (hasta 8).
type Slot = { side: "t" | "b" | "l" | "r"; at: number };
function chairSlots(seats: number): Slot[] {
  const n = Math.max(1, Math.min(seats, 8));
  if (n === 1) return [{ side: "b", at: 50 }];
  if (n === 2) return [{ side: "l", at: 50 }, { side: "r", at: 50 }];
  if (n === 3) return [{ side: "t", at: 50 }, { side: "l", at: 50 }, { side: "r", at: 50 }];
  if (n === 4) return [{ side: "t", at: 50 }, { side: "b", at: 50 }, { side: "l", at: 50 }, { side: "r", at: 50 }];
  if (n <= 6) {
    const s: Slot[] = [{ side: "t", at: 32 }, { side: "t", at: 68 }, { side: "b", at: 32 }, { side: "b", at: 68 }, { side: "l", at: 50 }];
    return n === 6 ? [...s, { side: "r", at: 50 }] : s;
  }
  const all: Slot[] = [{ side: "t", at: 32 }, { side: "t", at: 68 }, { side: "b", at: 32 }, { side: "b", at: 68 }, { side: "l", at: 35 }, { side: "l", at: 65 }, { side: "r", at: 35 }, { side: "r", at: 65 }];
  return all.slice(0, n);
}

function Chair({ side, at, busy }: { side: "t" | "b" | "l" | "r"; at: number; busy: boolean }) {
  const pos =
    side === "t" ? { left: `${at}%`, top: "2%", transform: "translateX(-50%)" } : side === "b" ? { left: `${at}%`, bottom: "2%", transform: "translateX(-50%)" } : side === "l" ? { top: `${at}%`, left: "2%", transform: "translateY(-50%)" } : { top: `${at}%`, right: "2%", transform: "translateY(-50%)" };
  const size = side === "t" || side === "b" ? "h-[11%] w-[26%]" : "h-[26%] w-[11%]";
  return <span aria-hidden style={pos} className={`absolute rounded-full ${size} ${busy ? "bg-[var(--p-brand)]/35" : "bg-black/12"}`} />;
}

// Elementos fijos dibujados en el plano (barra con aspecto de madera, pared, texto).
export function FixtureView({ f }: { f: Fixture }) {
  const style = { left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` };
  const tall = f.h * 3 > f.w * 4 * 1.5;
  if (f.kind === "LABEL")
    return (
      <div aria-hidden style={style} className="pointer-events-none absolute flex items-center justify-center text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--p-muted)] sm:text-xs">
        {f.label}
      </div>
    );
  if (f.kind === "WALL") return <div aria-hidden style={style} className="pointer-events-none absolute rounded-sm bg-neutral-700/80" />;
  return (
    <div aria-hidden style={style} className="pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-[#9a6b4b] to-[#6e4a33] text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[#fbf3ea] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_4px_10px_-4px_rgba(0,0,0,0.45)] ring-1 ring-black/20 sm:text-xs">
      <span className={tall ? "[writing-mode:vertical-rl]" : ""}>{f.label}</span>
    </div>
  );
}

// Una mesa del plano: tablero con sus sillas, o taburete redondo.
function TableTile({ t, now, selected, dimmed, onTap }: { t: Table; now: number; selected: boolean; dimmed: boolean; onTap: () => void }) {
  const o = t.open;
  const m = o ? mins(o.openedAt, now) : 0;
  const round = t.shape === "ROUND";
  const surface = !o ? "bg-white text-[var(--p-ink)] ring-1 ring-black/10" : o.billRequested ? "bg-amber-300 text-amber-950 ring-2 ring-amber-500" : "bg-[var(--p-brand)] text-white";
  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={selected}
      aria-label={`Mesa ${t.name}: ${o ? `${o.billRequested ? "pide la cuenta" : "ocupada"}, ${o.guests ?? "?"} comensales, ${m} minutos, ${euros(o.totalCents)}` : `libre, ${t.seats} plazas`}`}
      style={{ left: `${t.posX}%`, top: `${t.posY}%` }}
      className={`p-press absolute aspect-square -translate-x-1/2 -translate-y-1/2 transition-opacity ${round ? "w-[7%] min-w-[44px] max-w-[80px]" : "w-[10%] min-w-[56px] max-w-[120px]"} ${dimmed ? "opacity-30" : ""}`}
    >
      {!round && chairSlots(t.seats).map((c, i) => <Chair key={i} side={c.side} at={c.at} busy={Boolean(o)} />)}
      <span
        className={`absolute flex flex-col items-center justify-center overflow-hidden text-center shadow-[0_3px_10px_-3px_rgba(0,0,0,0.3)] ${round ? "inset-0 rounded-full" : "inset-[15%] rounded-xl"} ${surface} ${selected ? "outline outline-[3px] outline-offset-2 outline-[var(--p-ink)]" : ""}`}
      >
        <span className="text-[13px] font-bold leading-none sm:text-base">{t.name}</span>
        {o ? (
          <span className="mt-0.5 flex items-center gap-0.5 text-[9px] font-semibold leading-none opacity-90 sm:text-[11px]">
            <PersonIcon />
            {o.guests ?? "?"}
          </span>
        ) : (
          !round && <span className="mt-0.5 text-[9px] leading-none text-[var(--p-faint)] sm:text-[11px]">{t.seats} pax</span>
        )}
      </span>
      {o && (
        <span className={`absolute -top-1 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums leading-none shadow sm:text-[10px] ${timeTone(m)}`}>{m < 60 ? `${m}′` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`}</span>
      )}
      {o?.waiter && !round && (
        <span title={o.waiter} className="absolute -bottom-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--p-ink)] px-1 text-[9px] font-bold text-white shadow ring-2 ring-white">
          {initials(o.waiter)}
        </span>
      )}
      {o?.billRequested && <span aria-hidden className="absolute -right-1 -top-1 z-10 flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white shadow ring-2 ring-white">€</span>}
    </button>
  );
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-[1em] w-[1em] fill-current">
      <circle cx="8" cy="5" r="3" />
      <path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5z" />
    </svg>
  );
}

export default function SalaView({
  tables,
  allTables,
  fixtures,
  sees,
  canCharge = true,
  now,
  onOpenFree,
  onAction,
}: {
  tables: Table[];
  allTables: Table[];
  fixtures: Fixture[];
  sees: boolean;
  canCharge?: boolean;
  now: number;
  onOpenFree: (t: Table) => void;
  onAction: (t: Table, a: QuickAction) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<string | null>(null); // ficha en el móvil

  const busy = allTables.filter((t) => t.open);
  const guests = busy.reduce((a, t) => a + (t.open?.guests ?? 0), 0);
  const seats = allTables.reduce((a, t) => a + t.seats, 0);
  const billing = busy.filter((t) => t.open?.billRequested).length;
  const openTotal = busy.reduce((a, t) => a + (t.open?.totalCents ?? 0), 0);
  const oldest = busy.reduce<Table | null>((a, t) => (!a || new Date(t.open!.openedAt) < new Date(a.open!.openedAt) ? t : a), null);
  const list = [...busy].sort((a, b) => new Date(a.open!.openedAt).getTime() - new Date(b.open!.openedAt).getTime());
  const selected = allTables.find((t) => t.id === selectedId && t.open) ?? null;
  const sheetTable = allTables.find((t) => t.id === sheetFor && t.open) ?? null;

  const matches = (t: Table) => filter === "all" || (filter === "free" ? !t.open : filter === "busy" ? Boolean(t.open) : Boolean(t.open?.billRequested));
  const placed = tables.filter((t) => t.posX != null && t.posY != null);
  const loose = tables.filter((t) => t.posX == null || t.posY == null);

  function tap(t: Table) {
    if (!t.open) return onOpenFree(t);
    setSelectedId(t.id);
    // En pantallas pequeñas no hay panel lateral: la ficha sale desde abajo.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches) setSheetFor(t.id);
  }

  const kpis: { label: string; value: string; tone?: string }[] = [
    { label: "Ocupadas", value: `${busy.length}/${allTables.length}` },
    { label: "Comensales", value: seats ? `${guests}/${seats}` : `${guests}` },
    { label: "Piden la cuenta", value: String(billing), tone: billing ? "text-amber-600" : undefined },
    { label: "Más tiempo", value: oldest ? `${oldest.name} · ${minutesSince(oldest.open!.openedAt, now)}` : "—", tone: oldest && mins(oldest.open!.openedAt, now) >= 90 ? "text-red-600" : undefined },
    ...(sees ? [{ label: "En mesas", value: euros(openTotal) }] : []),
  ];
  const FILTERS: [Filter, string, number][] = [
    ["all", "Todas", tables.length],
    ["free", "Libres", tables.filter((t) => !t.open).length],
    ["busy", "Ocupadas", tables.filter((t) => t.open).length],
    ["bill", "Piden la cuenta", tables.filter((t) => t.open?.billRequested).length],
  ];

  return (
    <div className="mt-4">
      {/* Resumen de la sala */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-[132px] shrink-0 rounded-2xl bg-[var(--p-surface)] px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--p-muted)]">{k.label}</p>
            <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${k.tone ?? ""}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Mostrar">
        {FILTERS.map(([k, label, n]) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={`p-press shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium ${filter === k ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)] text-[var(--p-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"}`}>
            {label} <span className="tabular-nums opacity-70">{n}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-4 xl:flex-row xl:items-start">
        {/* Plano */}
        <div className="min-w-0 flex-1">
          {placed.length > 0 || fixtures.length > 0 ? (
            <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
              <div className="relative mx-auto aspect-[4/3] w-full min-w-[600px] overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#fbfaf7,#f1eee6)] shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_0_0_1px_rgba(0,0,0,0.05)] [background-size:100%_100%] lg:max-w-[calc((100vh-19rem)*4/3)]">
                <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(rgba(0,0,0,0.06)_1px,transparent_1px)] [background-size:22px_22px]" />
                {fixtures.map((f) => (
                  <FixtureView key={f.id} f={f} />
                ))}
                {placed.map((t) => (
                  <TableTile key={t.id} t={t} now={now} selected={selectedId === t.id} dimmed={!matches(t)} onTap={() => tap(t)} />
                ))}
              </div>
            </div>
          ) : null}
          {loose.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {loose.map((t) => (
                <div key={t.id} className="relative aspect-square">
                  <TableTile t={{ ...t, posX: 50, posY: 50 }} now={now} selected={selectedId === t.id} dimmed={!matches(t)} onTap={() => tap(t)} />
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--p-muted)]">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-white ring-1 ring-black/15" /> Libre</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[var(--p-brand)]" /> Ocupada</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-amber-300 ring-1 ring-amber-500" /> Pide la cuenta</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded-full bg-emerald-500" /><span className="h-3 w-5 rounded-full bg-amber-400" /><span className="h-3 w-5 rounded-full bg-red-500" /> Tiempo: menos de 45 min, hasta 90, más</span>
          </p>
        </div>

        {/* Panel de sala: mesas abiertas y ficha de la elegida */}
        <aside className="w-full shrink-0 space-y-3 xl:sticky xl:top-6 xl:w-[340px]" aria-label="Mesas abiertas">
          {selected && (
            <div className="hidden xl:block">
              <TableCard t={selected} now={now} canCharge={canCharge} onAction={(a) => onAction(selected, a)} onClose={() => setSelectedId(null)} />
            </div>
          )}
          <div className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="flex items-center justify-between border-b border-[var(--p-line)] px-4 py-3 text-sm font-semibold">
              Mesas abiertas <span className="text-xs font-normal text-[var(--p-muted)]">por orden de llegada</span>
            </p>
            {list.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--p-muted)]">Ninguna mesa abierta. Toca una mesa libre para abrirla.</p>
            ) : (
              <ul className="max-h-[50vh] divide-y divide-[var(--p-line)] overflow-y-auto">
                {list.map((t) => {
                  const o = t.open!;
                  const m = mins(o.openedAt, now);
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => tap(t)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.025] ${selectedId === t.id ? "bg-[var(--p-brand-soft)]" : ""}`}>
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold ${t.shape === "ROUND" ? "rounded-full" : "rounded-xl"} ${o.billRequested ? "bg-amber-300 text-amber-950" : "bg-[var(--p-brand)] text-white"}`}>{t.name}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {o.guests ?? "?"} pax · {o.lines} {o.lines === 1 ? "producto" : "productos"}
                          </span>
                          <span className="block truncate text-xs text-[var(--p-muted)]">{[t.zone, o.waiter, o.billRequested && "pide la cuenta"].filter(Boolean).join(" · ")}
                            {o.pending && <span className="font-semibold text-amber-700"> · sin enviar</span>}
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-semibold tabular-nums">{euros(o.totalCents)}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${timeTone(m)}`}>{minutesSince(o.openedAt, now)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {sheetTable && (
        <Sheet title={`Mesa ${sheetTable.name}`} onClose={() => setSheetFor(null)}>
          <TableCard
            canCharge={canCharge}
            t={sheetTable}
            now={now}
            bare
            onAction={(a) => {
              setSheetFor(null);
              onAction(sheetTable, a);
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

// Ficha de una mesa abierta con las acciones rápidas.
function TableCard({ t, now, bare, canCharge = true, onAction, onClose }: { t: Table; now: number; bare?: boolean; canCharge?: boolean; onAction: (a: QuickAction) => void; onClose?: () => void }) {
  const o = t.open!;
  const m = mins(o.openedAt, now);
  return (
    <div className={bare ? "" : "rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/5"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {!bare && <p className="text-lg font-semibold">Mesa {t.name}</p>}
          <p className="text-sm text-[var(--p-muted)]">
            {t.zone} · {o.guests ?? "?"} {o.guests === 1 ? "comensal" : "comensales"} · {o.orderNumber != null ? `cuenta nº ${o.orderNumber}` : "cuenta sin número aún"}
          </p>
          {o.pending && <p className="mt-0.5 text-xs font-semibold text-amber-700">Con cambios sin enviar: se envían al volver internet</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Cerrar la ficha" className="shrink-0 rounded-full px-2 py-1 text-sm text-[var(--p-muted)] hover:bg-black/[0.05]">
            ✕
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-black/[0.035] px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--p-muted)]">Total</p>
          <p className="text-xl font-bold tabular-nums">{euros(o.totalCents)}</p>
        </div>
        <div className="rounded-xl bg-black/[0.035] px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--p-muted)]">Abierta</p>
          <p className={`text-base font-semibold tabular-nums ${m >= 90 ? "text-red-600" : m >= 45 ? "text-amber-600" : ""}`}>{minutesSince(o.openedAt, now)}</p>
        </div>
        <div className="rounded-xl bg-black/[0.035] px-2 py-2">
          <p className="text-[10px] uppercase tracking-wide text-[var(--p-muted)]">Rondas</p>
          <p className="text-base font-semibold tabular-nums">{o.rounds}</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-[var(--p-muted)]">
        {[o.waiter && `Atiende ${o.waiter}`, o.lastRoundAt && `última ronda hace ${minutesSince(o.lastRoundAt, now)}`, `${o.lines} ${o.lines === 1 ? "producto" : "productos"}`].filter(Boolean).join(" · ")}
      </p>
      {o.billRequested && <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">Ha pedido la cuenta</p>}
      {/* Lo que más se hace con una mesa, en grande: nueva ronda y cobrar */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => onAction("round")} className={`p-press min-h-[72px] rounded-2xl bg-[var(--p-brand)] px-3 text-lg font-bold text-white shadow-[0_10px_24px_-14px_rgba(0,0,0,0.5)] ${canCharge ? "" : "col-span-2"}`}>
          + Nueva ronda
        </button>
        {canCharge && (
          <button type="button" onClick={() => onAction("pay")} className="p-press min-h-[72px] rounded-2xl bg-[var(--p-ink)] px-3 text-lg font-bold text-white shadow-[0_10px_24px_-14px_rgba(0,0,0,0.5)]">
            Cobrar
          </button>
        )}
        <button type="button" onClick={() => onAction("bill")} className="p-press min-h-14 rounded-2xl bg-black/[0.06] px-3 text-base font-semibold">
          Pedir cuenta
        </button>
        <button type="button" onClick={() => onAction("view")} className="p-press min-h-14 rounded-2xl bg-black/[0.06] px-3 text-base font-semibold">
          Ver cuenta
        </button>
      </div>
    </div>
  );
}
