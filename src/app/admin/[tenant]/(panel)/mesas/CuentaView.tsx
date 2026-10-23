"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { STORE_VARS } from "../storeVars";
import RoundComposer from "./RoundComposer";
import { PAY_LABEL, Sheet, Stepper, euros, hhmm, minutesSince, parseEuros, post, usePortal, type Cuenta, type CuentaLine } from "./shared";

// La cuenta de una mesa: rondas enviadas, lo cobrado por separado y las
// acciones (nueva ronda, imprimir la cuenta, cobrar, cambiar de mesa, cerrar).
// Se refresca sola: si otro camarero añade una ronda, aparece. Ver docs/MESAS.md

type PayMethod = "CASH" | "CARD_TERMINAL" | "BIZUM";
type Split = "all" | "items" | "equal";

function quickAmounts(total: number): number[] {
  const out = new Set<number>([total]);
  for (const bill of [500, 1000, 2000, 5000]) out.add(Math.ceil(total / bill) * bill);
  return [...out].filter((n) => n >= total).sort((a, b) => a - b).slice(0, 4);
}

export default function CuentaView({ tenant, orderId, onBack }: { tenant: string; orderId: string; onBack: (opts?: { closed?: boolean }) => void }) {
  const api = `/api/admin/${tenant}/mesas/${orderId}`;
  const [data, setData] = useState<Cuenta | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [composing, setComposing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const portal = usePortal();

  const load = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la mesa");
      setData(json as Cuenta);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la mesa");
    }
  }, [api]);

  useEffect(() => {
    let alive = true;
    const run = () => alive && !document.hidden && load();
    run();
    const t = setInterval(() => {
      run();
      setTick((n) => n + 1); // los minutos de la mesa
    }, 10000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [load]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 4000);
  };

  async function act(body: Record<string, unknown>, ok?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await post<Record<string, unknown>>(api, body);
      if (ok) flash(ok);
      await load();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido hacer");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function printBill() {
    const r = await act({ action: "bill" });
    if (r) flash((r.printed as number) > 0 ? "Cuenta enviada a la impresora" : "Mesa marcada «pide la cuenta» (no hay impresora de tickets)");
  }

  async function voidLine(l: CuentaLine) {
    if (!window.confirm(`¿Anular ${l.quantity}× ${l.name}? Se imprime en cocina «ANULADO · NO PREPARAR».`)) return;
    await act({ action: "void", lineId: l.id }, "Línea anulada");
  }

  async function closeEmpty() {
    const has = (data?.rounds.length ?? 0) > 0;
    if (!window.confirm(has ? "¿Cerrar la mesa sin cobrar? Lo consumido no se cobrará (el stock vuelve)." : "¿Cerrar la mesa? No tiene nada pedido.")) return;
    const r = await act({ action: "cancel" });
    if (r) onBack({ closed: true });
  }

  if (!data) {
    return (
      <div className="py-16 text-center text-sm text-[var(--p-muted)]">
        {error ? (
          <>
            <p className="text-[var(--p-accent)]">{error}</p>
            <button type="button" onClick={() => onBack()} className="mt-4 rounded-full bg-[var(--p-ink)] px-4 py-2 text-sm font-semibold text-white">
              Volver a mesas
            </button>
          </>
        ) : (
          "Cargando la mesa…"
        )}
      </div>
    );
  }

  const o = data.order;
  const closed = o.status !== "OPEN";
  const lineCount = data.rounds.reduce((a, r) => a + r.lines.reduce((b, l) => b + l.quantity, 0), 0);
  const paidParts = data.parts.reduce((a, p) => a + p.totalCents, 0);

  return (
    <div className="pb-40">
      <button type="button" onClick={() => onBack()} className="p-press -ml-2 rounded-full px-2 py-1.5 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
        ‹ Mesas
      </button>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">Mesa {o.table.name}</h1>
          <p className="mt-1 text-sm text-[var(--p-muted)]">
            {[o.table.zone, o.guests && `${o.guests} ${o.guests === 1 ? "comensal" : "comensales"}`, `abierta hace ${minutesSince(o.openedAt)}`, o.waiter, `cuenta nº ${o.orderNumber ?? "?"}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        {o.billRequestedAt && !closed && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Pide la cuenta</span>}
      </div>

      {closed && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Esta mesa ya está cobrada o cerrada.</p>}
      {error && <p className="mt-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p>}
      {notice && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {data.rounds.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-[var(--p-line)] px-4 py-10 text-center">
          <p className="font-semibold">Mesa abierta, sin pedir todavía</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">Toca «Nueva ronda» para tomar nota.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {data.rounds.map((r) => (
            <section key={r.round} className="overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" aria-label={`Ronda ${r.round}`}>
              <p className="flex items-center justify-between gap-2 border-b border-[var(--p-line)] px-4 py-2 text-xs font-semibold text-[var(--p-muted)]">
                <span>Ronda {r.round}</span>
                <span className="font-normal">{[hhmm(r.at), r.by].filter(Boolean).join(" · ")}</span>
              </p>
              <ul className="divide-y divide-[var(--p-line)]">
                {r.lines.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="w-7 shrink-0 text-sm font-semibold tabular-nums">{l.quantity}×</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{l.name}</p>
                      {l.modifiers.length > 0 && <p className="text-xs text-[var(--p-muted)]">{l.modifiers.join(" · ")}</p>}
                      {l.note && <p className="text-xs font-semibold text-[var(--p-brand)] wrap-anywhere">Nota: {l.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">{euros(l.totalCents)}</span>
                      {data.canVoid && !closed && (
                        <button type="button" onClick={() => voidLine(l)} disabled={busy} className="rounded-full px-2 py-0.5 text-xs font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
                          Anular
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {data.parts.length > 0 && (
        <section className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" aria-label="Cobrado por separado">
          <p className="font-semibold">Ya cobrado por separado · {euros(paidParts)}</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {data.parts.map((p) => (
              <li key={p.id}>
                Nº {p.orderNumber ?? "?"} · {euros(p.totalCents)} · {PAY_LABEL[p.paymentMethod] ?? p.paymentMethod}
                {p.paidAt && ` · ${hhmm(p.paidAt)}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!closed && (
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => setMoving(true)} disabled={busy} className="p-press rounded-full bg-[var(--p-surface)] px-4 py-2 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            Cambiar de mesa
          </button>
          <button type="button" onClick={closeEmpty} disabled={busy} className="p-press rounded-full px-4 py-2 font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
            Cerrar sin cobrar
          </button>
        </div>
      )}

      {/* Barra fija: total y lo que más se usa */}
      {!closed && portal && createPortal(
        <div style={STORE_VARS} className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--p-line)] bg-[var(--p-surface)] px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] text-[var(--p-ink)] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.2)] lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 sm:mr-auto">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--p-muted)]">
                  {lineCount} {lineCount === 1 ? "producto" : "productos"}
                  {paidParts > 0 && " · queda"}
                </p>
                <p className="text-xl font-semibold tabular-nums">{euros(o.totalCents)}</p>
              </div>
              <button type="button" onClick={printBill} disabled={busy || !lineCount} className="p-press shrink-0 rounded-2xl bg-black/[0.06] px-4 py-3 text-sm font-semibold disabled:opacity-50 sm:order-last">
                Cuenta
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" onClick={() => setPaying(true)} disabled={busy || !lineCount} className="p-press rounded-2xl bg-[var(--p-ink)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                Cobrar
              </button>
              <button type="button" onClick={() => setComposing(true)} disabled={busy} className="p-press rounded-2xl bg-[var(--p-brand)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
                + Nueva ronda
              </button>
            </div>
          </div>
        </div>,
        portal
      )}

      {composing && (
        <RoundComposer
          tenant={tenant}
          orderId={o.id}
          tableName={o.table.name}
          onClose={() => setComposing(false)}
          onSent={(round) => {
            setComposing(false);
            flash(`Ronda ${round} enviada a cocina`);
            load();
          }}
        />
      )}
      {paying && (
        <PaySheet
          data={data}
          api={api}
          onClose={() => setPaying(false)}
          onPaid={(r) => {
            if (r.closed) onBack({ closed: true });
            else {
              setPaying(false);
              load();
            }
          }}
        />
      )}
      {moving && (
        <Sheet title={`Pasar la mesa ${o.table.name} a…`} onClose={() => setMoving(false)}>
          {data.freeTables.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--p-muted)]">No hay mesas libres.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.freeTables.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const r = await act({ action: "move", tableId: t.id }, `Pasada a la mesa ${t.name}`);
                    if (r) setMoving(false);
                  }}
                  className="p-press flex flex-col items-center rounded-2xl border border-[var(--p-line)] px-2 py-3"
                >
                  <span className="text-lg font-semibold">{t.name}</span>
                  <span className="truncate text-[11px] text-[var(--p-muted)]">{t.zone}</span>
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

// Cobrar: todo, por productos (cada uno lo suyo) o a partes iguales.
function PaySheet({ data, api, onClose, onPaid }: { data: Cuenta; api: string; onClose: () => void; onPaid: (r: { closed: boolean }) => void }) {
  const lines = useMemo(() => data.rounds.flatMap((r) => r.lines), [data]);
  const [split, setSplit] = useState<Split>("all");
  const [units, setUnits] = useState<Record<string, number>>({});
  const [people, setPeople] = useState(Math.max(2, data.order.guests ?? 2));
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [tendered, setTendered] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ total: number; change: number | null; invoice: string | null; closed: boolean } | null>(null);

  const total = data.order.totalCents;
  const pickedTotal = lines.reduce((a, l) => a + Math.round((l.totalCents * (units[l.id] ?? 0)) / l.quantity), 0);
  const share = Math.ceil(total / Math.max(1, people));
  const amount = split === "items" ? pickedTotal : total;
  const tenderedCents = method === "CASH" && tendered.trim() ? parseEuros(tendered) : null;
  const change = tenderedCents != null && tenderedCents >= amount ? tenderedCents - amount : null;
  const short = tenderedCents != null && tenderedCents < amount;
  const canPay = amount > 0 && !sending && !short;

  async function pay() {
    if (!canPay) return;
    setSending(true);
    setError("");
    try {
      const r = await post<{ closed: boolean; totalCents: number; changeCents: number | null; invoiceNumber: string | null }>(api, {
        action: "pay",
        method,
        ...(tenderedCents != null && { cashTenderedCents: tenderedCents }),
        ...(split === "items" && { units: Object.entries(units).filter(([, q]) => q > 0).map(([lineId, qty]) => ({ lineId, qty })) }),
      });
      setDone({ total: r.totalCents, change: r.changeCents, invoice: r.invoiceNumber, closed: r.closed });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cobrar");
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <Sheet
        title="Cobrado"
        onClose={() => onPaid({ closed: done.closed })}
        footer={
          <button type="button" onClick={() => onPaid({ closed: done.closed })} className="p-press w-full rounded-2xl bg-[var(--p-ink)] py-3.5 text-sm font-semibold text-white">
            {done.closed ? "Volver a mesas" : "Seguir con la mesa"}
          </button>
        }
      >
        <div className="py-4 text-center">
          <p className="text-sm text-[var(--p-muted)]">{PAY_LABEL[method]}</p>
          <p className="text-4xl font-semibold tabular-nums">{euros(done.total)}</p>
          {done.change != null && (
            <p className="mt-3 rounded-2xl bg-emerald-50 py-3 text-lg font-semibold text-emerald-800">
              Cambio: <span className="tabular-nums">{euros(done.change)}</span>
            </p>
          )}
          {done.invoice && <p className="mt-3 text-sm text-[var(--p-muted)]">Factura simplificada {done.invoice}</p>}
          <p className="mt-2 text-sm text-[var(--p-muted)]">{done.closed ? "La mesa queda libre." : "El resto sigue en la mesa."}</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={`Cobrar · Mesa ${data.order.table.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          {error && <p className="mb-2 text-sm text-[var(--p-accent)]">{error}</p>}
          <button type="button" onClick={pay} disabled={!canPay} className="p-press w-full rounded-2xl bg-[var(--p-ink)] py-3.5 text-base font-semibold text-white disabled:opacity-50">
            {sending ? "Cobrando…" : amount > 0 ? `Cobrar ${euros(amount)}` : "Elige qué se cobra"}
          </button>
        </>
      }
    >
      <div className="flex gap-1.5 rounded-xl bg-black/[0.05] p-1" role="radiogroup" aria-label="Cómo se divide">
        {(
          [
            ["all", "Todo"],
            ["items", "Por productos"],
            ["equal", "A partes iguales"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={split === k} onClick={() => setSplit(k)} className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${split === k ? "bg-white text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.18)]" : "text-[var(--p-muted)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {split === "items" && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-[var(--p-muted)]">Marca lo que paga esta persona. El resto se queda en la mesa.</p>
          <ul className="divide-y divide-[var(--p-line)] rounded-2xl border border-[var(--p-line)]">
            {lines.map((l) => {
              const n = units[l.id] ?? 0;
              return (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {l.quantity}× {l.name}
                    </p>
                    <p className="text-xs text-[var(--p-muted)] tabular-nums">{euros(Math.round(l.totalCents / l.quantity))} c/u</p>
                  </div>
                  {l.quantity === 1 ? (
                    <button type="button" role="checkbox" aria-checked={n === 1} aria-label={`Paga ${l.name}`} onClick={() => setUnits((u) => ({ ...u, [l.id]: n ? 0 : 1 }))} className={`h-9 w-9 shrink-0 rounded-full border-2 text-sm font-bold ${n ? "border-[var(--p-brand)] bg-[var(--p-brand)] text-white" : "border-[var(--p-line)]"}`}>
                      {n ? "✓" : ""}
                    </button>
                  ) : (
                    <Stepper value={n} max={l.quantity} onChange={(v) => setUnits((u) => ({ ...u, [l.id]: v }))} label={l.name} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {split === "equal" && (
        <div className="mt-4 rounded-2xl bg-black/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">¿Entre cuántos?</span>
            <Stepper value={people} min={2} max={20} onChange={setPeople} label="personas" />
          </div>
          <p className="mt-3 text-center text-sm text-[var(--p-muted)]">Cada uno paga</p>
          <p className="text-center text-3xl font-semibold tabular-nums">{euros(share)}</p>
          <p className="mt-2 text-center text-xs text-[var(--p-muted)]">Se cobra la cuenta entera de una vez ({euros(total)}). Si cada uno paga de una forma distinta, usa «Por productos».</p>
        </div>
      )}

      <p className="mt-5 text-[13px] font-medium text-[var(--p-muted)]">Forma de pago</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["CASH", "CARD_TERMINAL", "BIZUM"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className={`p-press rounded-2xl border-2 py-3 text-sm font-semibold ${method === m ? "border-[var(--p-ink)] bg-white" : "border-[var(--p-line)]"}`}>
            {PAY_LABEL[m]}
          </button>
        ))}
      </div>

      {method === "CASH" && amount > 0 && (
        <div className="mt-4">
          <label className="text-[13px] font-medium text-[var(--p-muted)]" htmlFor="mesa-entregado">
            Entregado (opcional)
          </label>
          <input id="mesa-entregado" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" placeholder={euros(amount)} className="mt-1 w-full rounded-xl border border-[var(--p-line)] px-3 py-2.5 text-lg tabular-nums outline-none focus:border-[var(--p-brand)]" />
          <div className="mt-2 flex flex-wrap gap-2">
            {quickAmounts(amount).map((n) => (
              <button key={n} type="button" onClick={() => setTendered((n / 100).toFixed(2).replace(".", ","))} className="p-press rounded-full bg-black/[0.05] px-3 py-1.5 text-sm font-semibold tabular-nums">
                {euros(n)}
              </button>
            ))}
          </div>
          {change != null && <p className="mt-3 text-base font-semibold text-emerald-700">Cambio: {euros(change)}</p>}
          {short && <p className="mt-3 text-sm font-semibold text-[var(--p-accent)]">Faltan {euros(amount - (tenderedCents ?? 0))}</p>}
        </div>
      )}
    </Sheet>
  );
}
