"use client";

import { useMemo, useState } from "react";
import { unitCostCents } from "@/app/lib/costs";
import { UNIT_LABEL, euros, formatQty, type Ingredient, type MovementType, type Overview } from "./types";

type Props = { data: Overview; api: string; onSaved: () => Promise<void> };
type Action = { ingredient: Ingredient; type: "RECEIPT" | "COUNT" | "WASTE" | "MIN" };

const MOVE_LABEL: Record<MovementType, string> = {
  ORDER: "Pedido",
  ORDER_CANCEL: "Pedido cancelado",
  RECEIPT: "Entrada",
  COUNT: "Recuento",
  WASTE: "Merma",
};

const ACTION_TEXT: Record<Action["type"], { title: string; label: string; button: string }> = {
  RECEIPT: { title: "Entrada de mercancía", label: "Cantidad que entra", button: "Registrar entrada" },
  COUNT: { title: "Recuento", label: "Cantidad que hay ahora (contada)", button: "Guardar recuento" },
  WASTE: { title: "Merma", label: "Cantidad perdida", button: "Registrar merma" },
  MIN: { title: "Stock mínimo", label: "Avisar cuando quede menos de", button: "Guardar mínimo" },
};

function status(i: Ingredient): { label: string; cls: string; rank: number } {
  if (!i.trackStock) return { label: "Sin control", cls: "bg-[var(--p-bg)] text-[var(--p-muted)]", rank: 3 };
  if (i.stockQty <= 0) return { label: "Agotado", cls: "bg-red-50 text-red-600", rank: 0 };
  if (i.minStock != null && i.stockQty <= i.minStock) return { label: "Bajo", cls: "bg-amber-50 text-amber-700", rank: 1 };
  return { label: "OK", cls: "bg-emerald-50 text-emerald-700", rank: 2 };
}

export default function Inventario({ data, api, onSaved }: Props) {
  const [action, setAction] = useState<Action | null>(null);
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Valor del stock" value={euros(stockValue)} sub={`${tracked.length} ingredientes controlados`} />
        <Stat label="Avisos" value={String(low.length)} sub={low.length ? low.map((i) => i.name).join(", ") : "Todo en orden"} tone={low.length ? "warn" : "ok"} />
        <Stat label="Descuadres en recuentos" value={euros(countLoss)} sub="Últimos movimientos" tone={countLoss < 0 ? "warn" : "ok"} />
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
        <p className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 p-6 text-center text-sm text-[var(--p-muted)]">
          Crea primero tus ingredientes en la pestaña Ingredientes.
        </p>
      ) : (
        <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Stock por ingrediente</h2>
          <p className="px-4 pt-2 text-xs text-[var(--p-muted)]">
            Los ingredientes controlados se descuentan solos con cada pedido. Haz un recuento para empezar a controlar uno.
          </p>
          <ul className="divide-y divide-[var(--p-line)]">
            {sorted.map((i) => {
              const st = status(i);
              const open = action?.ingredient.id === i.id;
              return (
                <li key={i.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{i.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="text-xs text-[var(--p-muted)]">
                        {i.trackStock ? (
                          <>
                            Hay <span className="font-semibold text-[var(--p-ink)]">{formatQty(i.stockQty, i.baseUnit)}</span> ({euros(Math.max(i.stockQty, 0) * unitCostCents(i))})
                            {i.minStock != null && ` · mínimo ${formatQty(i.minStock, i.baseUnit)}`}
                          </>
                        ) : (
                          "No se descuenta con los pedidos"
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(["RECEIPT", "COUNT", "WASTE"] as const).map((t) => (
                        <button key={t} onClick={() => setAction(open && action?.type === t ? null : { ingredient: i, type: t })} className="rounded-lg border border-[var(--p-line)] px-2.5 py-1 text-xs font-semibold text-[var(--p-ink)] hover:bg-[var(--p-bg)]">
                          {t === "RECEIPT" ? "+ Entrada" : t === "COUNT" ? "Recuento" : "Merma"}
                        </button>
                      ))}
                      {i.trackStock && (
                        <button onClick={() => setAction(open && action?.type === "MIN" ? null : { ingredient: i, type: "MIN" })} className="rounded-lg border border-[var(--p-line)] px-2.5 py-1 text-xs text-[var(--p-muted)] hover:bg-[var(--p-bg)]">
                          Mínimo
                        </button>
                      )}
                      {i.trackStock && (
                        <button onClick={() => toggleTracking(i)} className="rounded-lg px-2.5 py-1 text-xs text-[var(--p-faint)] hover:text-red-500">
                          Dejar de controlar
                        </button>
                      )}
                    </div>
                  </div>
                  {open && action && <ActionForm action={action} api={api} onDone={async () => { setAction(null); await onSaved(); }} onCancel={() => setAction(null)} />}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="px-5 pt-4 pb-1 text-[17px] font-semibold">Últimos movimientos</h2>
        {data.movements.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--p-muted)]">Aún no hay movimientos de stock.</p>
        ) : (
          <ul className="divide-y divide-[var(--p-line)]">
            {data.movements.map((m) => {
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
      </section>
    </div>
  );
}

function ActionForm({ action, api, onDone, onCancel }: { action: Action; api: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const { ingredient: i, type } = action;
  const [qty, setQty] = useState(type === "MIN" && i.minStock != null ? String(i.minStock) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const text = ACTION_TEXT[type];
  const n = Number(qty.replace(",", "."));
  const diff = type === "COUNT" && qty !== "" && Number.isFinite(n) ? n - i.stockQty : null;

  async function submit() {
    setSaving(true);
    setError("");
    const res =
      type === "MIN"
        ? await fetch(`${api}/stock/${i.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ minStock: qty === "" ? null : n }) })
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
        {type !== "MIN" && (
          <label className="text-xs text-[var(--p-muted)]">
            Nota (opcional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={type === "WASTE" ? "Caducado, se cayó…" : "Albarán, proveedor…"} className="mt-1 w-full rounded-lg border border-[var(--p-line)] bg-white px-3 py-2 text-sm text-[var(--p-ink)]" />
          </label>
        )}
      </div>
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
    <div className="rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4">
      <div className="text-sm text-[var(--p-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "warn" ? "text-amber-700" : ""}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-[var(--p-muted)]">{sub}</div>
    </div>
  );
}
