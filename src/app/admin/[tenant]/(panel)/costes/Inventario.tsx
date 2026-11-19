"use client";

import { useMemo, useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { packsText } from "@/app/lib/costReports";
import InformeStock from "./InformeStock";
import AvisosMovil from "../AvisosMovil";
import { UNIT_LABEL, euros, formatQty, type Ingredient, type MovementType, type Overview } from "./types";

type Props = { data: Overview; api: string; onSaved: () => Promise<void>; onGoToIngredients: () => void };
export type Action = { ingredient: Ingredient; type: "RECEIPT" | "COUNT" | "WASTE" | "MIN" | "USE" };

const MOVE_LABEL: Record<MovementType, string> = {
  ORDER: "Pedido",
  ORDER_CANCEL: "Pedido cancelado",
  RECEIPT: "Entrada",
  COUNT: "Recuento",
  WASTE: "Merma",
  PRODUCTION: "Lote",
  USE: "Gastado",
};

const ACTION_TEXT: Record<Action["type"], { title: string; label: string; button: string }> = {
  RECEIPT: { title: "Entrada de mercancía", label: "Cantidad que entra", button: "Registrar entrada" },
  COUNT: { title: "Recuento", label: "Cantidad que hay ahora (contada)", button: "Guardar recuento" },
  WASTE: { title: "Merma", label: "Cantidad perdida", button: "Registrar merma" },
  MIN: { title: "Mínimo y stock normal", label: "Avisar cuando quede menos de", button: "Guardar" },
  USE: { title: "He gastado", label: "Cantidad gastada", button: "Registrar" },
};

function status(i: Ingredient): { label: string; cls: string; rank: number } {
  if (!i.trackStock) return { label: "Sin control", cls: "bg-[var(--p-bg)] text-[var(--p-muted)]", rank: 3 };
  if (i.stockQty <= 0) return { label: "Agotado", cls: "bg-red-50 text-red-600", rank: 0 };
  if (i.minStock != null && i.stockQty <= i.minStock) return { label: "Bajo", cls: "bg-amber-50 text-amber-700", rank: 1 };
  return { label: "OK", cls: "bg-emerald-50 text-emerald-700", rank: 2 };
}

// Para que quepa en ~2 pantallas del móvil: cada ingrediente en una línea (sus
// botones al tocarlo), los no controlados plegados, y el informe y los
// movimientos plegados con su resumen.
const MOVES_FIRST = 3;

export default function Inventario({ data, api, onSaved, onGoToIngredients }: Props) {
  const [action, setAction] = useState<Action | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [showUntracked, setShowUntracked] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [allMoves, setAllMoves] = useState(false);
  const ingredientsById = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);

  const sorted = [...data.ingredients].sort((a, b) => status(a).rank - status(b).rank || a.name.localeCompare(b.name, "es"));
  const tracked = data.ingredients.filter((i) => i.trackStock);
  const low = tracked.filter((i) => status(i).rank <= 1);
  const stockValue = tracked.reduce((acc, i) => acc + Math.max(i.stockQty, 0) * unitCostCents(i), 0);

  // Agotados automáticos en la carta (platos y opciones).
  const outProducts = data.categories.flatMap((c) => c.products.filter((p) => p.stockOut).map((p) => p.name));
  const outOptions = [
    ...new Set(data.categories.flatMap((c) => c.products.flatMap((p) => p.modifierGroups.flatMap((g) => g.group.options.filter((o) => o.stockOut).map((o) => o.name))))),
  ];

  // Descuadres: diferencias negativas en recuentos entre los últimos movimientos.
  const countLoss = data.movements.filter((m) => m.type === "COUNT" && m.valueCents < 0).reduce((acc, m) => acc + m.valueCents, 0);

  async function toggleTracking(i: Ingredient) {
    await fetch(`${api}/stock/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trackStock: !i.trackStock }) });
    await onSaved();
  }

  return (
    <div className="space-y-6">
      {tracked.some((i) => i.minStock != null) && <AvisosMovil tenant={api.split("/")[3]} />}
      <div className="grid grid-cols-3 divide-x divide-[var(--p-line)] rounded-2xl bg-[var(--p-surface)] py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <Stat label="Valor del stock" value={euros(stockValue)} sub={`${tracked.length} controlados`} />
        <Stat label="Bajo mínimo" value={String(low.length)} sub={low.length ? low.map((i) => i.name).join(", ") : "Todo en orden"} tone={low.length ? "warn" : "ok"} />
        <Stat label="Descuadres" value={euros(countLoss)} sub="en recuentos" tone={countLoss < 0 ? "warn" : "ok"} />
      </div>

      {(outProducts.length > 0 || outOptions.length > 0) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-semibold">Agotado en la carta por falta de ingredientes</p>
          {outProducts.length > 0 && <p className="mt-1">Platos: {outProducts.join(", ")}</p>}
          {outOptions.length > 0 && <p className="mt-1">Opciones: {outOptions.join(", ")}</p>}
          <p className="mt-1 text-xs text-red-600/80">Vuelven a aparecer solos al registrar una entrada.</p>
        </div>
      )}

      {data.ingredients.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/60 p-6 text-center">
          <p className="font-semibold">Primero crea tus ingredientes</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">El stock se lleva por ingrediente y se descuenta solo con cada venta.</p>
          <button onClick={onGoToIngredients} className="mt-4 p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
            Ir a ingredientes
          </button>
        </div>
      ) : (
        <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="px-4 pt-4 text-[17px] font-semibold sm:px-5">Stock por ingrediente</h2>
          <p className="px-4 pb-2 text-xs text-[var(--p-muted)] sm:px-5">Se descuentan solos con cada pedido. Toca uno para registrar una entrada, un recuento o una merma.</p>
          <ul className="mt-1 divide-y divide-[var(--p-line)] border-t border-[var(--p-line)]">
            {sorted.filter((i) => i.trackStock || showUntracked).map((i) => {
              const st = status(i);
              const open = action?.ingredient.id === i.id;
              const expanded = openRow === i.id || open;
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenRow(expanded ? null : i.id);
                      if (expanded) setAction(null);
                    }}
                    aria-expanded={expanded}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{i.name}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="truncate text-xs text-[var(--p-muted)]">
                        {i.trackStock ? (
                          <>
                            Hay <span className="font-semibold text-[var(--p-ink)]">{formatQty(i.stockQty, i.baseUnit)}</span>
                            {packsText(i.stockQty, i.packSize, i.baseUnit) && <> ({packsText(i.stockQty, i.packSize, i.baseUnit)})</>}
                            {i.minStock != null && ` · mín. ${formatQty(i.minStock, i.baseUnit)}`}
                          </>
                        ) : (
                          "No se descuenta con los pedidos"
                        )}
                      </div>
                    </div>
                    {i.trackStock && <span className="shrink-0 text-sm font-semibold tabular-nums">{euros(Math.max(i.stockQty, 0) * unitCostCents(i))}</span>}
                    <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-[var(--p-faint)] transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>
                      <path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {expanded && (
                    <div className="bg-[var(--p-bg)] px-4 pt-1 pb-3">
                      {i.trackStock && i.parStock != null && <p className="mb-2 text-xs text-[var(--p-muted)]">Stock normal: {formatQty(i.parStock, i.baseUnit)}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {(["RECEIPT", "COUNT", "WASTE"] as const).map((t) => (
                          <button key={t} onClick={() => setAction(open && action?.type === t ? null : { ingredient: i, type: t })} className={`p-press min-h-10 rounded-full border px-3.5 text-sm font-semibold ${open && action?.type === t ? "border-[var(--p-ink)] bg-[var(--p-ink)] text-white" : "border-[var(--p-line)] bg-[var(--p-surface)] text-[var(--p-ink)]"}`}>
                            {t === "RECEIPT" ? "+ Entrada" : t === "COUNT" ? "Recuento" : "Merma"}
                          </button>
                        ))}
                        {i.trackStock && (
                          <button onClick={() => setAction(open && action?.type === "MIN" ? null : { ingredient: i, type: "MIN" })} className={`p-press min-h-10 rounded-full border px-3.5 text-sm ${open && action?.type === "MIN" ? "border-[var(--p-ink)] bg-[var(--p-ink)] text-white" : "border-[var(--p-line)] bg-[var(--p-surface)] text-[var(--p-muted)]"}`}>
                            Mínimo y normal
                          </button>
                        )}
                        {i.trackStock && (
                          <button onClick={() => toggleTracking(i)} className="min-h-10 rounded-full px-3 text-sm text-[var(--p-faint)] hover:text-red-500">
                            Dejar de controlar
                          </button>
                        )}
                      </div>
                      {open && action && <ActionForm action={action} api={api} onDone={async () => { setAction(null); await onSaved(); }} onCancel={() => setAction(null)} />}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {data.ingredients.length > tracked.length && (
            <button type="button" onClick={() => setShowUntracked((v) => !v)} className="p-press w-full border-t border-[var(--p-line)] px-4 py-3 text-sm font-semibold text-[var(--p-brand)] hover:bg-black/[0.02]">
              {showUntracked ? "Ocultar los que no controlas" : `Ver los ${data.ingredients.length - tracked.length} que no controlas`}
            </button>
          )}
        </section>
      )}

      {tracked.length > 0 && (
        <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <button type="button" onClick={() => setShowReport((v) => !v)} aria-expanded={showReport} className="flex w-full items-center gap-3 p-4 text-left sm:px-5">
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold">Informe de stock y género parado</span>
              <span className="block text-sm text-[var(--p-muted)]">Comprado, vendido, mermas, lo que falta y lo que no sale</span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--p-bg)] px-3 py-1.5 text-xs font-semibold">{showReport ? "Cerrar" : "Ver"}</span>
          </button>
        </section>
      )}
      {tracked.length > 0 && showReport && <InformeStock data={data} api={api} />}

      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-2 text-[17px] font-semibold">Últimos movimientos</h2>
        {data.movements.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--p-muted)]">Aún no hay movimientos de stock.</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {(allMoves ? data.movements : data.movements.slice(0, MOVES_FIRST)).map((m) => {
              const ing = ingredientsById.get(m.ingredientId);
              const unit = ing?.baseUnit ?? "UNIT";
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-semibold">{ing?.name ?? "—"}</span> <span className="text-[var(--p-muted)]">· {MOVE_LABEL[m.type]}</span>
                    <div className="text-[11px] text-[var(--p-faint)]">
                      {new Date(m.createdAt).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {m.note && ` · ${m.note}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${m.quantity < 0 ? "text-red-600" : "text-emerald-700"}`}>
                      {m.quantity > 0 ? "+" : ""}
                      {formatQty(m.quantity, unit)}
                    </div>
                    <div className="text-[11px] text-[var(--p-muted)]">
                      {euros(m.valueCents)} · queda {formatQty(m.stockAfter, unit)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {data.movements.length > MOVES_FIRST && (
          <button type="button" onClick={() => setAllMoves((v) => !v)} className="p-press w-full border-t border-[var(--p-line)] px-4 py-3 text-sm font-semibold text-[var(--p-brand)] hover:bg-black/[0.02]">
            {allMoves ? "Ver menos" : `Ver los ${data.movements.length} movimientos`}
          </button>
        )}
      </section>
    </div>
  );
}

export function ActionForm({ action, api, onDone, onCancel }: { action: Action; api: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const { ingredient: i, type } = action;
  const [qty, setQty] = useState(type === "MIN" && i.minStock != null ? String(i.minStock) : "");
  const [par, setPar] = useState(i.parStock != null ? String(i.parStock) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const text = ACTION_TEXT[type];
  const n = Number(qty.replace(",", "."));
  const diff = type === "COUNT" && qty !== "" && Number.isFinite(n) ? n - i.stockQty : null;

  const p = Number(par.replace(",", "."));

  async function submit() {
    if (type === "MIN" && qty !== "" && par !== "" && p <= n) {
      setError("El stock normal tiene que ser mayor que el mínimo");
      return;
    }
    setSaving(true);
    setError("");
    const res =
      type === "MIN"
        ? await fetch(`${api}/stock/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minStock: qty === "" ? null : n, parStock: par === "" ? null : p }) })
        : await fetch(`${api}/stock`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ingredientId: i.id, type, quantity: n, note }) });
    setSaving(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "No se pudo guardar");
      return;
    }
    await onDone();
  }

  return (
    <div className="mt-3 rounded-lg bg-[var(--p-bg)] p-3">
      <p className="mb-2 text-sm font-semibold">{text.title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-[var(--p-muted)]">
          {text.label} ({UNIT_LABEL[i.baseUnit]})
          <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--p-line)] bg-white px-3 py-2 text-sm text-[var(--p-ink)]" />
        </label>
        {type === "MIN" && (
          <label className="text-xs text-[var(--p-muted)]">
            Stock normal: reponer hasta ({UNIT_LABEL[i.baseUnit]})
            <input inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} placeholder="Opcional" className="mt-1 w-full rounded-lg border border-[var(--p-line)] bg-white px-3 py-2 text-sm text-[var(--p-ink)]" />
          </label>
        )}
        {type !== "MIN" && (
          <label className="text-xs text-[var(--p-muted)]">
            Nota (opcional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "WASTE" ? "Caducado, se cayó…" : type === "USE" ? "Limpieza del fin de semana…" : "Albarán, proveedor…"} className="mt-1 w-full rounded-lg border border-[var(--p-line)] bg-white px-3 py-2 text-sm text-[var(--p-ink)]" />
          </label>
        )}
      </div>
      {type === "MIN" && <p className="mt-2 text-xs text-[var(--p-muted)]">Al bajar del mínimo te avisamos y en Compras se sugiere pedir hasta el stock normal (si no lo pones, hasta el doble del mínimo).</p>}
      {diff != null && i.trackStock && (
        <p className={`mt-2 text-xs ${diff < 0 ? "text-red-600" : "text-[var(--p-muted)]"}`}>
          Diferencia con el stock teórico: {diff > 0 ? "+" : ""}
          {formatQty(diff, i.baseUnit)} ({euros(diff * unitCostCents(i))})
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button onClick={submit} disabled={saving} className="p-press rounded-full bg-[var(--p-brand)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Guardando…" : text.button}
        </button>
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-[var(--p-muted)] hover:bg-white">Cancelar</button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "warn" }) {
  return (
    <div className="min-w-0 px-3 sm:px-4">
      <div className="text-xs leading-tight text-[var(--p-muted)]">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums sm:text-2xl ${tone === "warn" ? "text-amber-700" : ""}`}>{value}</div>
      <div className="truncate text-[11px] leading-tight text-[var(--p-muted)]">{sub}</div>
    </div>
  );
}
