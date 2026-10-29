"use client";

import { ask } from "@/app/lib/dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { STORE_VARS } from "../storeVars";
import RoundComposer from "./RoundComposer";
import { PAY_LABEL, Sheet, Stepper, euros, hhmm, minutesSince, parseEuros, post, usePortal, type Cuenta, type CuentaLine, type Table } from "./shared";
import { loadLocal, saveLocal, sendOrQueue, type Sent } from "../outbox";
import { cuentaKey, isOffline, isPendingLine, pendingRoundsAsCuenta, type TableOverlay } from "./offline";

// La cuenta de una mesa: rondas enviadas, lo cobrado por separado y las
// acciones (nueva ronda, imprimir la cuenta, cobrar, cambiar de mesa, cerrar).
// Se refresca sola: si otro camarero añade una ronda, aparece. Sin internet se
// ve la última cuenta guardada con lo que espera en la cola encima, y se puede
// tomar nota, cobrar, pedir la cuenta y cambiar de mesa: se envía al volver.
// Ver docs/MESAS.md y docs/SIN-CONEXION.md

type PayMethod = "CASH" | "CARD_TERMINAL" | "BIZUM";
type Split = "all" | "items" | "equal";

function quickAmounts(total: number): number[] {
  const out = new Set<number>([total]);
  for (const bill of [500, 1000, 2000, 5000]) out.add(Math.ceil(total / bill) * bill);
  return [...out].filter((n) => n >= total).sort((a, b) => a - b).slice(0, 4);
}

type Sendable = { url: string; body: Record<string, unknown> };

export default function CuentaView({ tenant, table, overlay, offlineFreeTables, onBack, initialAction, canCharge = true }: { tenant: string; table: Table; overlay?: TableOverlay; offlineFreeTables: { id: string; name: string; zone: string }[] | null; onBack: (opts?: { closed?: boolean; notice?: string }) => void; initialAction?: "round" | "pay"; canCharge?: boolean }) {
  const orderId = table.open?.orderId ?? null;
  const api = orderId ? `/api/admin/${tenant}/mesas/${orderId}` : null;
  const [server, setServer] = useState<Cuenta | null>(() => (orderId ? (loadLocal<Cuenta>(cuentaKey(orderId)) ?? null) : null));
  const [offline, setOffline] = useState(!orderId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [composing, setComposing] = useState(initialAction === "round");
  const [paying, setPaying] = useState(initialAction === "pay" && canCharge);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const portal = usePortal();

  const load = useCallback(async () => {
    if (!api || !orderId) return setOffline(true); // abierta sin conexión: aún no tiene cuenta en el servidor
    try {
      const res = await fetch(api, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la mesa");
      saveLocal(cuentaKey(orderId), json);
      setServer(json as Cuenta);
      setOffline(false);
      setError("");
    } catch (e) {
      if (isOffline(e)) setOffline(true);
      else setError(e instanceof Error ? e.message : "No se pudo cargar la mesa");
    }
  }, [api, orderId]);

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

  // La cuenta que se ve: la del servidor (o la guardada) más lo que espera en la cola.
  const data = useMemo<Cuenta | null>(() => {
    const open = table.open;
    if (!server && !open && !overlay?.paidAll) return null;
    const pending = pendingRoundsAsCuenta(overlay?.rounds ?? []);
    const extra = pending.reduce((a, r) => a + r.lines.reduce((b, l) => b + l.totalCents, 0), 0);
    const paid = overlay?.paidCents ?? 0;
    const baseTotal = server ? server.order.totalCents : Math.max(0, (open?.totalCents ?? 0) - extra + paid);
    const order: Cuenta["order"] = server?.order ?? {
      id: orderId ?? "",
      orderNumber: open?.orderNumber ?? null,
      status: "OPEN",
      table: { id: table.id, name: table.name, zone: table.zone },
      guests: open?.guests ?? null,
      openedAt: open?.openedAt ?? new Date().toISOString(),
      billRequestedAt: null,
      totalCents: 0,
      subtotalCents: 0,
      collaboratorDiscountCents: 0,
      collaborator: null,
      waiter: open?.waiter ?? null,
      invoiceNumber: null,
    };
    return {
      order: {
        ...order,
        table: { id: table.id, name: table.name, zone: table.zone }, // la mesa de ahora (puede haberse cambiado sin conexión)
        // Cobrada entera sin conexión: se ve cerrada aunque el servidor aún no lo sepa.
        status: overlay?.paidAll ? "PAID_OFFLINE" : order.status,
        totalCents: Math.max(0, baseTotal + extra - paid),
        billRequestedAt: order.billRequestedAt ?? (overlay?.billed || open?.billRequested ? new Date().toISOString() : null),
      },
      rounds: [...(server?.rounds ?? []), ...pending],
      parts: server?.parts ?? [],
      freeTables: offlineFreeTables ?? server?.freeTables ?? [],
      canVoid: !offline && (server?.canVoid ?? false),
    };
  }, [server, table, overlay, orderId, offline, offlineFreeTables]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 4000);
  };

  // Adónde va cada acción: a su cuenta o, si la mesa se abrió sin conexión, a la mesa.
  const target = useCallback(
    (body: Record<string, unknown>): Sendable => {
      if (api) return { url: api, body };
      const { action, tableId: to, ...rest } = body;
      return { url: `/api/admin/${tenant}/mesas`, body: { ...rest, action: "table", op: action, tableId: table.id, ...(action === "move" && { toTableId: to }) } };
    },
    [api, tenant, table.id]
  );

  // Lo que se puede guardar sin conexión (ronda, cuenta, cobro, cambio de mesa).
  async function queueable(body: Record<string, unknown>, label: string, ok: string, queued: string) {
    setBusy(true);
    setError("");
    try {
      const t = target(body);
      const r = await sendOrQueue<Record<string, unknown>>(t.url, t.body, label);
      flash(r.queued ? queued : ok);
      if (!r.queued) await load();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se ha podido hacer");
      return null;
    } finally {
      setBusy(false);
    }
  }

  // Lo que necesita internet (anular, cerrar sin cobrar, colaborador).
  async function act(body: Record<string, unknown>, ok?: string) {
    if (offline || !api) {
      setError("Sin conexión: esto se puede hacer cuando vuelva internet.");
      return null;
    }
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
    const r = await queueable({ action: "bill" }, `Mesa ${table.name} · pide la cuenta`, "Cuenta enviada a la impresora", "Sin conexión: la cuenta saldrá en la impresora al volver internet");
    if (r && !r.queued && !((r.data.printed as number) > 0)) flash("Mesa marcada «pide la cuenta» (no hay impresora de tickets)");
  }

  async function voidLine(l: CuentaLine) {
    if (!(await ask(`¿Anular ${l.quantity}× ${l.name}? Se imprime en cocina «ANULADO · NO PREPARAR».`))) return;
    await act({ action: "void", lineId: l.id }, "Línea anulada");
  }

  async function closeEmpty() {
    const has = (data?.rounds.length ?? 0) > 0;
    if (!(await ask(has ? "¿Cerrar la mesa sin cobrar? Lo consumido no se cobrará (el stock vuelve)." : "¿Cerrar la mesa? No tiene nada pedido.", { confirm: has ? "Cerrar sin cobrar" : "Cerrar la mesa", danger: has }))) return;
    const r = await act({ action: "cancel" });
    if (r) onBack({ closed: true });
  }

  if (!data) {
    return (
      <div className="py-16 text-center text-sm text-[var(--p-muted)]">
        {error ? <p className="text-[var(--p-accent)]">{error}</p> : <p>Cargando la mesa…</p>}
        <button type="button" onClick={() => onBack()} className="mt-5 inline-block rounded-full bg-[var(--p-ink)] px-4 py-2.5 text-sm font-semibold text-white">
          Volver a mesas
        </button>
      </div>
    );
  }

  const o = data.order;
  const closed = o.status !== "OPEN";
  const unsent = (overlay?.rounds.length ?? 0) > 0 || (overlay?.paidCents ?? 0) > 0 || Boolean(overlay?.billed);
  // Abierta sin conexión o sin la cuenta guardada: lo de antes no se puede detallar.
  const blind = offline && !server && Boolean(orderId);
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

      {closed && <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{o.status === "PAID_OFFLINE" ? "Cobrada sin conexión: se registrará al volver internet." : "Esta mesa ya está cobrada o cerrada."}</p>}
      {offline && !closed && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <span className="font-semibold">Sin conexión.</span> Puedes tomar nota, pedir la cuenta, cobrar y cambiar de mesa: se guarda en este aparato y se envía solo al volver internet.
          {blind && " Lo pedido antes no está guardado en este aparato: el total es el último que se vio."}
        </p>
      )}
      {!offline && unsent && !closed && (
        <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          Enviando lo que se guardó sin conexión…
        </p>
      )}
      {error && <p className="mt-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p>}
      {notice && (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {notice}
        </p>
      )}

      {data.rounds.length === 0 && !blind ? (
        <button
          type="button"
          onClick={() => setComposing(true)}
          disabled={closed}
          className="p-press mt-5 flex w-full flex-col items-center justify-center rounded-3xl bg-[var(--p-brand)] px-6 py-14 text-center text-white shadow-[0_12px_32px_-14px_rgba(0,0,0,0.45)] sm:py-20"
        >
          <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-4xl font-light leading-none">+</span>
          <span className="mt-4 text-2xl font-bold">Tomar nota</span>
          <span className="mt-1 text-base opacity-85">Mesa {o.table.name} · {o.guests ?? "?"} {o.guests === 1 ? "comensal" : "comensales"}</span>
        </button>
      ) : (
        <div className="mt-5 space-y-3">
          {data.rounds.map((r) => (
            <section key={r.round} className="overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" aria-label={`Ronda ${r.round}`}>
              <p className="flex items-center justify-between gap-2 border-b border-[var(--p-line)] px-4 py-2 text-xs font-semibold text-[var(--p-muted)]">
                <span>{r.round < 0 ? <span className="text-amber-700">Sin enviar · saldrá al volver internet</span> : `Ronda ${r.round}`}</span>
                <span className="font-normal">{[hhmm(r.at), r.by].filter(Boolean).join(" · ")}</span>
              </p>
              <ul className="divide-y divide-[var(--p-line)]">
                {r.lines.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="w-7 shrink-0 text-sm font-semibold tabular-nums">{l.quantity}×</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{l.name}</p>
                      {l.modifiers.length > 0 && <p className="text-xs text-[var(--p-muted)]">{l.modifiers.join(" · ")}</p>}
                      {l.note && <p className="text-xs font-semibold text-[var(--p-brand)] wrap-anywhere">Nota: {l.note}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums">{euros(l.totalCents)}</span>
                      {data.canVoid && !closed && !isPendingLine(l.id) && (
                        <button type="button" onClick={() => voidLine(l)} disabled={busy} className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
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

      {!closed && !offline && data.rounds.length > 0 && <CollabRow order={o} busy={busy} onApply={(code) => act({ action: "collab", code }, code ? "Colaborador aplicado a la cuenta" : "Colaborador quitado")} />}

      {!closed && (
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <button type="button" onClick={() => setMoving(true)} disabled={busy} className="p-press rounded-full bg-[var(--p-surface)] px-4 py-2 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            Cambiar de mesa
          </button>
          {!offline && (
            <button type="button" onClick={closeEmpty} disabled={busy} className="p-press rounded-full px-4 py-2 font-medium text-[var(--p-accent)] hover:bg-[var(--p-accent-soft)]">
              Cerrar sin cobrar
            </button>
          )}
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
                  {o.collaboratorDiscountCents > 0 && ` · −${euros(o.collaboratorDiscountCents)} de ${o.collaborator?.name.split(" ")[0] ?? "colaborador"}`}
                </p>
                <p className="text-xl font-semibold tabular-nums">{euros(o.totalCents)}</p>
              </div>
              <button type="button" onClick={printBill} disabled={busy || (!lineCount && !blind)} className="p-press shrink-0 rounded-2xl bg-black/[0.06] px-5 py-4 text-base font-semibold disabled:opacity-50 sm:order-last">
                Cuenta
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {canCharge ? (
                <button type="button" onClick={() => setPaying(true)} disabled={busy || (!lineCount && !blind) || o.totalCents <= 0} className="p-press rounded-2xl bg-[var(--p-ink)] px-6 py-4 text-base font-bold text-white disabled:opacity-50 sm:min-w-[150px]">
                  Cobrar
                </button>
              ) : (
                <span className="flex items-center justify-center rounded-2xl bg-black/[0.04] px-4 py-4 text-center text-sm font-medium text-[var(--p-muted)] sm:min-w-[150px]">Cobra la caja</span>
              )}
              <button type="button" onClick={() => setComposing(true)} disabled={busy} className="p-press rounded-2xl bg-[var(--p-brand)] px-6 py-4 text-base font-bold text-white disabled:opacity-50 sm:min-w-[190px]">
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
          orderId={orderId}
          opening={orderId ? undefined : { tableId: table.id, guests: table.open?.guests ?? 1 }}
          tableName={o.table.name}
          onClose={() => setComposing(false)}
          onSent={(round) => {
            setComposing(false);
            flash(round == null ? "Sin conexión: la ronda se ha guardado y saldrá en cocina en cuanto vuelva internet" : `Ronda ${round} enviada a cocina`);
            load();
          }}
        />
      )}
      {paying && (
        <PaySheet
          data={data}
          send={async (body, label) => {
            const t = target(body);
            return sendOrQueue(t.url, t.body, label);
          }}
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
                    const r = await queueable({ action: "move", tableId: t.id }, `Mesa ${o.table.name} → ${t.name}`, `Pasada a la mesa ${t.name}`, `Sin conexión: pasada a la mesa ${t.name} (se registra al volver internet)`);
                    if (r) onBack({ notice: r.queued ? `Sin conexión: mesa ${o.table.name} pasada a la ${t.name}. Se registra al volver internet` : `Mesa ${o.table.name} pasada a la ${t.name}` });
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

// «¿Vienen de parte de alguien?»: el código del guía, del hotel… Se aplica su
// descuento a toda la cuenta y su comisión cuenta al cobrar. Ver docs/COLABORADORES.md
function CollabRow({ order, busy, onApply }: { order: Cuenta["order"]; busy: boolean; onApply: (code: string) => Promise<unknown> }) {
  const [code, setCode] = useState("");
  const c = order.collaborator;
  if (c) {
    return (
      <section className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" aria-label="Colaborador">
        <span className="min-w-0">
          Vienen de parte de <span className="font-semibold">{c.name}</span> <span className="font-mono text-xs tracking-wider">({c.code})</span>
          {c.discountPct > 0 && (
            <span className="block text-xs">
              Descuento del {c.discountPct.toLocaleString("es-ES")} % en la cuenta: −{euros(order.collaboratorDiscountCents)}
            </span>
          )}
        </span>
        <button type="button" onClick={() => onApply("")} disabled={busy} className="rounded-full px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">
          Quitar
        </button>
      </section>
    );
  }
  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--p-surface)] px-4 py-3 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (code.trim() && (await onApply(code.trim()))) setCode("");
      }}
    >
      <span className="text-[var(--p-muted)]">¿Vienen de parte de alguien?</span>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} placeholder="Código del guía, hotel…" aria-label="Código de colaborador" className="min-w-0 flex-1 rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm font-semibold tracking-wider" />
      <button type="submit" disabled={busy || !code.trim()} className="p-press rounded-full bg-[var(--p-ink)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        Aplicar
      </button>
    </form>
  );
}

// Cobrar: todo, por productos (cada uno lo suyo) o a partes iguales.
type PayResult = { closed: boolean; totalCents: number; changeCents: number | null; invoiceNumber: string | null };

function PaySheet({ data, send, onClose, onPaid }: { data: Cuenta; send: (body: Record<string, unknown>, label: string) => Promise<Sent<PayResult>>; onClose: () => void; onPaid: (r: { closed: boolean }) => void }) {
  const lines = useMemo(() => data.rounds.flatMap((r) => r.lines), [data]);
  const [split, setSplit] = useState<Split>("all");
  const [units, setUnits] = useState<Record<string, number>>({});
  const [people, setPeople] = useState(Math.max(2, data.order.guests ?? 2));
  const [method, setMethod] = useState<PayMethod>("CASH");
  const [tendered, setTendered] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ total: number; change: number | null; invoice: string | null; closed: boolean; queued: boolean } | null>(null);

  const total = data.order.totalCents;
  const pickedGross = lines.reduce((a, l) => a + Math.round((l.totalCents * (units[l.id] ?? 0)) / l.quantity), 0);
  // Con colaborador en la mesa, lo cobrado por separado también lleva su descuento.
  const collabPct = data.order.collaborator?.discountPct ?? 0;
  const pickedTotal = pickedGross - (collabPct > 0 ? Math.round((pickedGross * collabPct) / 100) : 0);
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
      const picked = split === "items" ? Object.entries(units).filter(([, q]) => q > 0).map(([lineId, qty]) => ({ lineId, qty })) : null;
      const label = `Mesa ${data.order.table.name} · cobro de ${euros(amount)} (${PAY_LABEL[method].toLowerCase()})`;
      const r = await send(
        {
          action: "pay",
          method,
          ...(tenderedCents != null && { cashTenderedCents: tenderedCents }),
          ...(picked && { units: picked }),
          preview: { totalCents: amount }, // para enseñarlo sin conexión
        },
        label
      );
      // Sin conexión: el cobro queda guardado; el cambio se calcula aquí.
      if (r.queued) setDone({ total: amount, change: tenderedCents != null ? tenderedCents - amount : null, invoice: null, closed: !picked, queued: true });
      else setDone({ total: r.data.totalCents, change: r.data.changeCents, invoice: r.data.invoiceNumber, closed: r.data.closed, queued: false });
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
          {done.queued && <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Sin conexión: el cobro queda guardado y se registra (con su factura y su ticket) al volver internet.</p>}
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
              if (isPendingLine(l.id))
                return (
                  <li key={l.id} className="flex items-center gap-3 px-3 py-2 opacity-60">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium">
                      {l.quantity}× {l.name}
                    </p>
                    <span className="shrink-0 text-xs text-[var(--p-muted)]">Sin enviar: cóbralo con «Todo»</span>
                  </li>
                );
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
