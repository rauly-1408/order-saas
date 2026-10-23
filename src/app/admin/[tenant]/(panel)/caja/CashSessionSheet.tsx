"use client";

import { useEffect, useState } from "react";

// Hoja «Caja»: abrir con un fondo, apuntar entradas y salidas de efectivo y
// cerrar contando el cajón. Quien no tiene «Ve lo recaudado» cuenta a ciegas:
// no ve cuánto debería haber ni la diferencia. Ver docs/CAJA.md

type PayKey = "CASH" | "CARD_TERMINAL" | "BIZUM" | "CARD" | "IN_STORE";
type Figures = { orders: number; byPayment: Record<PayKey, number>; totalCents: number; cashSalesCents: number; inCents: number; outCents: number; expectedCashCents: number };
type Movement = { id: string; kind: "IN" | "OUT"; amountCents: number; reason: string; userName: string | null; createdAt: string };
type Closing = { id: string; openedAt: string; closedAt: string; openedByName: string | null; closedByName: string | null; openingFloatCents: number; countedCashCents: number; expectedCashCents: number; differenceCents: number; notes: string | null };
export type CashState = {
  seesTakings: boolean;
  open: { id: string; openedAt: string; openedByName: string | null; openingFloatCents: number; movements: Movement[] } | null;
  figures: Figures | null;
  history: Closing[];
  reasons: string[];
};
type Closed = { id: string; countedCashCents: number; expectedCashCents?: number; differenceCents?: number; figures?: Figures };

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const parseEuros = (v: string): number | null => {
  const s = v.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
const dayHour = (iso: string) => new Date(iso).toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const PAY: Record<PayKey, string> = { CASH: "Efectivo", CARD_TERMINAL: "Datáfono", BIZUM: "Bizum", CARD: "Tarjeta online", IN_STORE: "Al recoger" };
const diffLabel = (d: number) => (d === 0 ? "Cuadra" : d > 0 ? `Sobran ${euros(d)}` : `Faltan ${euros(-d)}`);
const diffTone = (d: number) => (d === 0 ? "bg-emerald-50 text-emerald-700" : Math.abs(d) <= 100 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-600");

function MoneyInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <div className="relative">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, "").replace(".", ","))}
        inputMode="decimal"
        placeholder="0,00"
        aria-label={label}
        className="w-full rounded-2xl border border-[var(--p-line)] bg-transparent px-4 py-3 pr-10 text-right text-3xl font-semibold tabular-nums outline-none focus:border-[var(--p-brand)]"
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xl text-[var(--p-muted)]">€</span>
    </div>
  );
}

export default function CashSessionSheet({ tenant, state, onState, onClose }: { tenant: string; state: CashState | null; onState: (s: CashState) => void; onClose: () => void }) {
  const api = `/api/admin/${tenant}/caja/sesion`;
  const [step, setStep] = useState<"main" | "move" | "close" | "done">("main");
  const [amount, setAmount] = useState("");
  const [moveKind, setMoveKind] = useState<"IN" | "OUT">("OUT");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState<Closed | null>(null);

  useEffect(() => {
    if (state?.reasons?.length && !reason) setReason(state.reasons[0]);
  }, [state, reason]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      onState(json as CashState);
      return json as CashState & { closed?: Closed };
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openCash() {
    const c = parseEuros(amount || "0");
    if (c == null) return setError("Escribe el efectivo con el que abres, por ejemplo 100.");
    if (await post({ action: "open", floatCents: c })) {
      setAmount("");
      setStep("main");
    }
  }
  async function addMove() {
    const c = parseEuros(amount);
    if (!c) return setError("Escribe un importe.");
    if (await post({ action: "move", kind: moveKind, amountCents: c, reason })) {
      setAmount("");
      setStep("main");
    }
  }
  async function closeCash() {
    const c = parseEuros(amount);
    if (c == null) return setError("Escribe el efectivo que has contado (puede ser 0).");
    if (!confirm(`¿Cerrar la caja con ${euros(c)} contados en el cajón?`)) return;
    const r = await post({ action: "close", countedCents: c, notes });
    if (r?.closed) {
      setClosed(r.closed);
      setAmount("");
      setNotes("");
      setStep("done");
    }
  }

  const open = state?.open;
  const fig = state?.figures;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label="Caja">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-[24px] bg-[var(--p-surface)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--p-ink)] lg:max-w-lg lg:rounded-[24px]">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15 lg:hidden" />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Caja</h2>
            <p className="text-xs text-[var(--p-muted)]">{open ? `Abierta desde las ${hhmm(open.openedAt)}${open.openedByName ? ` · ${open.openedByName}` : ""}` : "Cerrada"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
            Cerrar
          </button>
        </div>

        {!state ? (
          <p className="py-8 text-center text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : step === "done" && closed ? (
          /* ── Resultado del cierre ── */
          <div className="mt-6 text-center" role="status">
            {closed.differenceCents != null ? (
              <>
                <p className="text-sm text-[var(--p-muted)]">Caja cerrada</p>
                <p className={`mx-auto mt-3 inline-block rounded-2xl px-5 py-3 text-3xl font-semibold ${diffTone(closed.differenceCents)}`}>{diffLabel(closed.differenceCents)}</p>
                <dl className="mx-auto mt-5 max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-[var(--p-muted)]">Debería haber</dt>
                    <dd className="font-semibold tabular-nums">{euros(closed.expectedCashCents ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[var(--p-muted)]">Contado</dt>
                    <dd className="font-semibold tabular-nums">{euros(closed.countedCashCents)}</dd>
                  </div>
                  {closed.figures && (
                    <div className="flex justify-between">
                      <dt className="text-[var(--p-muted)]">Cobrado en total</dt>
                      <dd className="font-semibold tabular-nums">{euros(closed.figures.totalCents)}</dd>
                    </div>
                  )}
                </dl>
              </>
            ) : (
              <>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
                <p className="mt-3 text-lg font-semibold">Caja cerrada</p>
                <p className="mt-1 text-sm text-[var(--p-muted)]">Recuento guardado: {euros(closed.countedCashCents)}. El administrador verá si cuadra.</p>
              </>
            )}
            <p className="mt-4 text-xs text-[var(--p-muted)]">Si hay impresora de tickets, sale el informe de cierre.</p>
            <button type="button" onClick={onClose} className="p-press mt-6 w-full rounded-full bg-[var(--p-brand)] py-3.5 text-base font-semibold text-white">
              Listo
            </button>
          </div>
        ) : !open ? (
          /* ── Abrir caja ── */
          <div className="mt-5">
            <p className="text-sm font-medium">¿Con cuánto efectivo empiezas?</p>
            <p className="mt-0.5 text-xs text-[var(--p-muted)]">El cambio que dejas en el cajón al abrir. Si no dejas nada, pon 0.</p>
            <div className="mt-3">
              <MoneyInput value={amount} onChange={setAmount} label="Fondo de apertura" autoFocus />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[0, 50, 100, 150, 200].map((v) => (
                <button key={v} type="button" onClick={() => setAmount(String(v))} className="p-press rounded-full bg-black/[0.05] px-3.5 py-2 text-sm font-semibold tabular-nums">
                  {v} €
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
            <button type="button" onClick={openCash} disabled={busy} className="p-press mt-5 w-full rounded-full bg-[var(--p-brand)] py-3.5 text-base font-semibold text-white disabled:opacity-50">
              {busy ? "Abriendo…" : "Abrir caja"}
            </button>
            {state.history.length > 0 && <History items={state.history} />}
          </div>
        ) : step === "move" ? (
          /* ── Entrada o salida de dinero ── */
          <div className="mt-5">
            <div className="flex gap-1.5 rounded-xl bg-black/[0.05] p-1" role="radiogroup" aria-label="Tipo de movimiento">
              {(
                [
                  ["OUT", "Sale dinero"],
                  ["IN", "Entra dinero"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={moveKind === k} onClick={() => setMoveKind(k)} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${moveKind === k ? "bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18)]" : "text-[var(--p-muted)]"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <MoneyInput value={amount} onChange={setAmount} label="Importe" autoFocus />
            </div>
            <p className="mt-3 text-sm font-medium">Motivo</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {state.reasons.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${reason === r ? "bg-[var(--p-ink)] text-white" : "bg-black/[0.05]"}`}>
                  {r}
                </button>
              ))}
            </div>
            {error && <p className="mt-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setStep("main")} className="rounded-full border border-[var(--p-line)] px-5 py-3 text-sm font-medium">
                Volver
              </button>
              <button type="button" onClick={addMove} disabled={busy} className="p-press flex-1 rounded-full bg-[var(--p-brand)] py-3 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Guardando…" : moveKind === "OUT" ? "Apuntar salida" : "Apuntar entrada"}
              </button>
            </div>
          </div>
        ) : step === "close" ? (
          /* ── Cerrar: contar el cajón (a ciegas: lo esperado se ve después) ── */
          <div className="mt-5">
            <p className="text-sm font-medium">Cuenta el efectivo del cajón</p>
            <p className="mt-0.5 text-xs text-[var(--p-muted)]">Billetes y monedas, incluido el fondo con el que abriste. Escribe el total.</p>
            <div className="mt-3">
              <MoneyInput value={amount} onChange={setAmount} label="Efectivo contado" autoFocus />
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 300))} rows={2} placeholder="Nota (opcional): un billete roto, un vale…" className="mt-3 w-full resize-none rounded-xl border border-[var(--p-line)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]" />
            {error && <p className="mt-3 text-sm text-[var(--p-accent)]" role="alert">{error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setStep("main")} className="rounded-full border border-[var(--p-line)] px-5 py-3 text-sm font-medium">
                Volver
              </button>
              <button type="button" onClick={closeCash} disabled={busy || amount === ""} className="p-press flex-1 rounded-full bg-[var(--p-accent)] py-3 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Cerrando…" : "Cerrar caja"}
              </button>
            </div>
          </div>
        ) : (
          /* ── Caja abierta ── */
          <div className="mt-5">
            {fig ? (
              <div className="rounded-2xl bg-[var(--p-bg)] p-4">
                <p className="text-xs uppercase tracking-wide text-[var(--p-muted)]">Debería haber en el cajón</p>
                <p className="text-4xl font-semibold tabular-nums tracking-tight">{euros(fig.expectedCashCents)}</p>
                <dl className="mt-3 space-y-1 text-sm">
                  <Row label="Fondo de apertura" value={euros(open.openingFloatCents)} />
                  <Row label="+ Ventas en efectivo" value={euros(fig.cashSalesCents)} />
                  {fig.inCents > 0 && <Row label="+ Entradas" value={euros(fig.inCents)} />}
                  {fig.outCents > 0 && <Row label="− Salidas" value={euros(fig.outCents)} />}
                </dl>
                <div className="mt-3 border-t border-[var(--p-line)] pt-3">
                  <p className="text-xs text-[var(--p-muted)]">
                    Cobrado desde la apertura · {fig.orders} {fig.orders === 1 ? "pedido" : "pedidos"}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(Object.keys(PAY) as PayKey[])
                      .filter((k) => fig.byPayment[k] > 0)
                      .map((k) => (
                        <span key={k} className="rounded-full bg-[var(--p-surface)] px-2.5 py-1 text-xs font-medium">
                          {PAY[k]} <span className="tabular-nums">{euros(fig.byPayment[k])}</span>
                        </span>
                      ))}
                    {fig.orders === 0 && <span className="text-xs text-[var(--p-muted)]">Todavía nada.</span>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-[var(--p-bg)] p-4 text-sm text-[var(--p-muted)]">Fondo de apertura: {euros(open.openingFloatCents)}. Al cerrar contarás el cajón.</p>
            )}

            {open.movements.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">Entradas y salidas</p>
                <ul className="mt-1 divide-y divide-[var(--p-line)] text-sm">
                  {open.movements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate">
                        <span className="text-[var(--p-muted)]">{hhmm(m.createdAt)}</span> {m.reason}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${m.kind === "OUT" ? "text-[var(--p-accent)]" : "text-emerald-700"}`}>
                        {m.kind === "OUT" ? "−" : "+"}
                        {euros(m.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMoveKind("OUT");
                  setAmount("");
                  setError("");
                  setStep("move");
                }}
                className="p-press rounded-2xl bg-black/[0.05] px-3 py-3 text-sm font-semibold"
              >
                − Sale dinero
              </button>
              <button
                type="button"
                onClick={() => {
                  setMoveKind("IN");
                  setAmount("");
                  setError("");
                  setStep("move");
                }}
                className="p-press rounded-2xl bg-black/[0.05] px-3 py-3 text-sm font-semibold"
              >
                + Entra dinero
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setAmount("");
                setError("");
                setStep("close");
              }}
              className="p-press mt-3 w-full rounded-full bg-[var(--p-accent)] py-3.5 text-base font-semibold text-white"
            >
              Cerrar caja y contar
            </button>
            {state.history.length > 0 && <History items={state.history} />}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--p-muted)]">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}

// Cierres anteriores (solo con «Ve lo recaudado»).
function History({ items }: { items: Closing[] }) {
  return (
    <div className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--p-muted)]">Cierres anteriores</p>
      <ul className="mt-1 divide-y divide-[var(--p-line)]">
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium first-letter:uppercase">{dayHour(c.closedAt)}</span>
              <span className="block truncate text-xs text-[var(--p-muted)]">
                Contado {euros(c.countedCashCents)}
                {c.closedByName ? ` · ${c.closedByName}` : ""}
                {c.notes ? ` · ${c.notes}` : ""}
              </span>
            </span>
            <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${diffTone(c.differenceCents)}`}>{diffLabel(c.differenceCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
