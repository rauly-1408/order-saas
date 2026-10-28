"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import OrderCard from "./OrderCard";
import PaidWithChooser, { type PaidWith } from "./PaidWith";
import {
  cancelLabel,
  COLUMNS,
  dropTarget,
  nextAction,
  orderLabel,
  toEuros,
  type ColumnKey,
  type DropKey,
  type Estimates,
  type Order,
} from "./orderBoard";
import StoreControls, { type StoreLive } from "./StoreControls";
import { playOrderChime, repeatUntilAccepted, setRepeatUntilAccepted, setSoundEnabled, SOUND_EVENT, soundEnabled, unlockAudio } from "../sound";

const POLL_MS = 10_000;
const CLOCK_MS = 15_000;
// Mientras haya pedidos sin aceptar, el aviso se repite (como las tablets de
// Glovo / Uber Eats) para que ninguno se quede olvidado.

type OrdersResponse = { orders: Order[]; history?: Order[]; estimates?: Estimates; store?: StoreLive | null; courierEnabled?: boolean; printingEnabled?: boolean; stores?: { id: string; name: string }[]; storeFilter?: string | null };
const STORE_FILTER_KEY = "panel-store-filter";

const DEFAULT_ESTIMATES: Estimates = { deliveryMinutes: 45, pickupMinutes: 20 };

export default function AdminPanel({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [estimates, setEstimates] = useState<Estimates>(DEFAULT_ESTIMATES);
  const [storeLive, setStoreLive] = useState<StoreLive | null>(null);
  const [courierEnabled, setCourierEnabled] = useState(false);
  const [printingEnabled, setPrintingEnabled] = useState(false);
  // Sucursales: filtro por local (se recuerda en este dispositivo).
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [storeFilter, setStoreFilter] = useState<string>(() => {
    try {
      return typeof window === "undefined" ? "" : localStorage.getItem(STORE_FILTER_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [tab, setTab] = useState<ColumnKey>("NEW");
  const [now, setNow] = useState(() => Date.now());
  // El sonido lo gestiona el aviso global (OrderAlerts); aquí solo el interruptor.
  const [soundOn, setSoundOn] = useState(true);
  const [repeatOn, setRepeatOn] = useState(true);

  // Arrastrar tarjetas: solo con ratón y tablero en columnas (lg). En el móvil
  // arrastrar choca con el scroll; ahí manda el botón de cada tarjeta.
  const [canDrag, setCanDrag] = useState(false);
  const [drag, setDrag] = useState<{ id: string; to: DropKey } | null>(null);
  const [over, setOver] = useState<DropKey | null>(null);
  const [payRequests, setPayRequests] = useState<Record<string, number>>({});
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const sync = () => setCanDrag(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const prevIds = useRef<Set<string>>(new Set());
  // Distingue la primera carga de un panel vacío: el primer pedido nuevo sí
  // cambia a la pestaña "Nuevos".
  const initialLoadDone = useRef(false);


  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${tenant}${storeFilter ? `?store=${encodeURIComponent(storeFilter)}` : ""}`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace(`/admin/${tenant}/login`);
        return;
      }
      if (!res.ok) {
        setError("No se pudieron cargar los pedidos. Reintentando…");
        return;
      }
      const data = (await res.json()) as OrdersResponse;
      const incoming = data.orders ?? [];
      const hasNew = incoming.some((o) => !prevIds.current.has(o.id));
      if (hasNew && initialLoadDone.current) setTab("NEW");
      prevIds.current = new Set(incoming.map((o) => o.id));
      initialLoadDone.current = true;
      setOrders(incoming);
      setHistory(data.history ?? []);
      if (data.estimates) setEstimates(data.estimates);
      setStoreLive(data.store ?? null);
      setCourierEnabled(!!data.courierEnabled);
      setPrintingEnabled(!!data.printingEnabled);
      setStores(data.stores ?? []);
      setError("");
    } catch {
      setError("Sin conexión. Reintentando…");
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, [tenant, router, storeFilter]);

  useEffect(() => {
    loadOrders();
    const poll = setInterval(loadOrders, POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [loadOrders]);

  // Pedido nuevo detectado por el aviso global: refrescar el tablero ya.
  useEffect(() => {
    const onNew = () => loadOrders();
    window.addEventListener("panel-new-order", onNew);
    return () => window.removeEventListener("panel-new-order", onNew);
  }, [loadOrders]);

  useEffect(() => {
    const sync = () => {
      setSoundOn(soundEnabled());
      setRepeatOn(repeatUntilAccepted());
    };
    sync();
    window.addEventListener(SOUND_EVENT, sync);
    return () => window.removeEventListener(SOUND_EVENT, sync);
  }, []);

  async function toggleSound() {
    const next = !soundOn;
    setSoundEnabled(next);
    if (next && (await unlockAudio())) playOrderChime();
  }

  // newStatus null = solo apuntar el cobro de un pedido ya entregado.
  async function handleStatus(orderId: string, newStatus: string | null, paidWith?: PaidWith) {
    setUpdating(orderId);
    setError("");
    try {
      const res = await fetch(`/api/orders/status/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(newStatus && { status: newStatus }), ...(paidWith && { paidWith }) }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; refundError?: string | null };
      await loadOrders();
      // Después de refrescar (que borra los avisos): el error o, si se canceló un
      // pedido pagado online y la pasarela no devolvió el dinero, ese aviso.
      if (!res.ok) setError(data.error ?? "No se pudo actualizar el pedido");
      else if (data.refundError) setError(data.refundError);
    } catch {
      setError("Sin conexión. No se pudo actualizar el pedido.");
    } finally {
      setUpdating(null);
    }
  }


  // Reimprimir comanda o ticket (la cola la vacía el agente del local).
  async function handlePrint(orderId: string, kind: "KITCHEN" | "RECEIPT") {
    setError("");
    try {
      const res = await fetch(`/api/admin/${tenant}/print/${orderId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? "No se pudo imprimir");
    } catch {
      setError("Sin conexión. No se pudo imprimir.");
    }
  }

  // Repartidor externo: pedir/reintentar (POST) o cancelar (DELETE).
  async function handleCourier(orderId: string, action: "request" | "cancel") {
    setUpdating(orderId);
    setError("");
    try {
      const res = await fetch(`/api/admin/${tenant}/courier/${orderId}`, { method: action === "request" ? "POST" : "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      await loadOrders();
      if (!res.ok) setError(data.error ?? "No se pudo gestionar el repartidor");
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setUpdating(null);
    }
  }

  // Soltar la tarjeta: la misma transición que el botón. Si hay que cobrar al
  // entregar, la tarjeta pregunta cómo ha pagado en vez de cerrarse sin más.
  function handleDrop(key: DropKey) {
    const current = drag;
    setDrag(null);
    setOver(null);
    if (!current || current.to !== key) return;
    const order = orders.find((o) => o.id === current.id);
    const action = order && nextAction(order);
    if (!order || !action) return;
    const needsPay = action.status === "DELIVERED" && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED";
    if (needsPay) setPayRequests((r) => ({ ...r, [order.id]: (r[order.id] ?? 0) + 1 }));
    else handleStatus(order.id, action.status);
  }
  const dropProps = (key: DropKey) =>
    canDrag
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (drag?.to !== key) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (over !== key) setOver(key);
          },
          onDragLeave: (e: React.DragEvent) => {
            if (over === key && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            handleDrop(key);
          },
        }
      : {};
  const dragged = drag ? orders.find((o) => o.id === drag.id) : null;
  const dropLabel = dragged ? nextAction(dragged)?.label : null;

  const byColumn = (key: ColumnKey) => {
    const col = COLUMNS.find((c) => c.key === key);
    return col ? orders.filter((o) => col.statuses.includes(o.status)) : [];
  };

  const [collectFor, setCollectFor] = useState<string | null>(null); // pedido del historial al que apuntar el cobro
  const delivered = history.filter((o) => o.status === "DELIVERED").length;
  const cancelled = history.length - delivered;

  return (
    <div className="text-[var(--p-ink)]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pedidos</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--p-muted)]">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : "bg-emerald-400"}`} />
            {error ? "Problema de conexión" : "En directo"}
            {!error && <span className="hidden sm:inline">· actualiza cada 10 s</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSound}
            aria-pressed={soundOn}
            title={soundOn ? "Silenciar los avisos" : "Activar los avisos sonoros"}
            className={`p-press rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
              soundOn
                ? "border-transparent bg-black/[0.05] text-[var(--p-ink)] hover:bg-black/[0.08]"
                : "border-[var(--p-accent)] bg-[var(--p-accent)] text-white"
            }`}
          >
            {soundOn ? "🔔 Sonido activado" : "🔕 Sonido silenciado"}
          </button>
          {soundOn && (
            <button
              onClick={() => setRepeatUntilAccepted(!repeatOn)}
              aria-pressed={repeatOn}
              title={repeatOn ? "Suena sin parar hasta que aceptes el pedido" : "Suena una sola vez por pedido nuevo"}
              className="p-press rounded-full border border-transparent bg-black/[0.05] px-3.5 py-1.5 text-xs font-semibold text-[var(--p-ink)] hover:bg-black/[0.08]"
            >
              {repeatOn ? "🔁 Repetir hasta aceptar" : "1️⃣ Sonar una vez"}
            </button>
          )}
        </div>
      </header>

      {!soundOn && (
        <p className="mb-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">
          Los avisos sonoros están silenciados. No oirás los pedidos nuevos.
        </p>
      )}

      {stores.length > 1 && (
        <label className="mb-4 flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--p-muted)]">📍 Local</span>
          <select
            value={storeFilter}
            onChange={(e) => {
              setStoreFilter(e.target.value);
              try {
                localStorage.setItem(STORE_FILTER_KEY, e.target.value);
              } catch {}
            }}
            className="rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-1.5 text-sm font-medium"
          >
            <option value="">Todos los locales</option>
            {stores.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {storeLive && (stores.length <= 1 || storeFilter) && <StoreControls tenant={tenant} live={storeLive} onChange={loadOrders} store={storeFilter || null} />}

      {error && <div className="mb-4 rounded-2xl bg-[var(--p-accent-soft)] px-4 py-2 text-sm text-[var(--p-accent)]">{error}</div>}

      {/* Pestañas con contador (móvil / tablet vertical) */}
      <nav className="mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1 lg:hidden">
        {COLUMNS.map((col) => {
          const count = byColumn(col.key).length;
          const active = tab === col.key;
          return (
            <button
              key={col.key}
              onClick={() => setTab(col.key)}
              className={`p-press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
                active ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"
              }`}
            >
              {col.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  col.key === "NEW" && count > 0 ? "bg-[var(--p-accent)] text-white" : "bg-black/[0.06] text-[var(--p-ink)]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {loading ? (
        <div className="py-20 text-center text-[var(--p-muted)]">Cargando pedidos…</div>
      ) : (
        <div>
          <div className="grid gap-4 lg:grid-cols-4">
            {COLUMNS.map((col) => {
              const list = byColumn(col.key);
              const isTarget = drag?.to === col.key;
              const dimmed = !!drag && !isTarget;
              return (
                <section
                  key={col.key}
                  {...dropProps(col.key)}
                  className={`${tab === col.key ? "block" : "hidden lg:block"} rounded-2xl transition-[opacity,box-shadow,background-color] duration-150 ${
                    dimmed ? "opacity-40" : ""
                  } ${isTarget ? "-m-2 bg-[var(--p-brand)]/[0.06] p-2 ring-2 ring-dashed ring-[var(--p-brand)]/50" : ""} ${over === col.key ? "!bg-[var(--p-brand)]/[0.12] !ring-[var(--p-brand)]" : ""}`}
                >
                  <h2
                    className={`mb-3 hidden items-center justify-between px-1 text-[15px] font-semibold lg:flex ${col.accent}`}
                  >
                    <span>
                      {col.label}
                    </span>
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-black/[0.05] px-2 text-sm tabular-nums text-[var(--p-ink)]">{list.length}</span>
                  </h2>
                  {isTarget && (
                    <p className="mb-3 rounded-xl border border-dashed border-[var(--p-brand)]/50 bg-[var(--p-surface)] px-3 py-2 text-center text-sm font-semibold text-[var(--p-brand)]">
                      Suelta aquí · {dropLabel}
                    </p>
                  )}
                  <div className="space-y-3">
                    {list.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-black/10 bg-[var(--p-surface)]/60 py-8 text-center text-sm text-[var(--p-faint)]">
                        {col.key === "NEW" ? "Sin pedidos nuevos" : "Vacío"}
                      </p>
                    ) : (
                      list.map((o) => (
                        <OrderCard
                          key={o.id}
                          order={o}
                          estimates={estimates}
                          now={now}
                          busy={updating === o.id}
                          onStatus={handleStatus}
                          courierEnabled={courierEnabled}
                          onCourier={handleCourier}
                          printingEnabled={printingEnabled}
                          onPrint={handlePrint}
                          draggable={canDrag && !!dropTarget(o)}
                          dragging={drag?.id === o.id}
                          onDragStart={(id) => {
                            const to = dropTarget(o);
                            if (to) setDrag({ id, to });
                          }}
                          onDragEnd={() => {
                            setDrag(null);
                            setOver(null);
                          }}
                          payRequest={payRequests[o.id] ?? 0}
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Zona «Entregado»: barra fija abajo mientras se arrastra un pedido listo o en reparto (solo lg) */}
          {drag?.to === "DONE" && (
            <div
              {...dropProps("DONE")}
              className={`fixed inset-x-4 bottom-5 z-30 rounded-2xl border-2 border-dashed py-6 text-center text-[15px] font-semibold shadow-lg transition-colors lg:left-[calc(16rem+2.5rem)] lg:right-10 ${
                over === "DONE" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-emerald-400/70 bg-emerald-50/90 text-emerald-700"
              }`}
            >
              ✅ Suelta aquí · {dropLabel}
            </div>
          )}

          <details className="mt-8 rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <summary className="cursor-pointer px-5 py-4 text-[15px] font-semibold">
              Últimas 24 h · {delivered} entregados · {cancelled} cancelados
            </summary>
            {history.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-[var(--p-muted)]">Todavía no hay pedidos cerrados.</p>
            ) : (
              <ul className="divide-y divide-[var(--p-line)] px-4 pb-2">
                {history.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-bold">{orderLabel(o)}</span>{" "}
                      <span className="text-[var(--p-muted)]">{o.customerName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-[var(--p-muted)]">{toEuros(o.totalCents)}</span>
                      {o.status === "DELIVERED" && o.paymentStatus === "PAID" && (
                        <Link href={`/admin/${tenant}/facturas?pedido=${o.id}`} className="rounded-full bg-black/[0.04] px-2 py-0.5 text-xs font-semibold text-[var(--p-muted)] hover:text-[var(--p-ink)]">
                          Factura
                        </Link>
                      )}
                      {o.status === "DELIVERED" && o.paymentStatus !== "PAID" && o.paymentStatus !== "REFUNDED" && (
                        <button type="button" onClick={() => setCollectFor(collectFor === o.id ? null : o.id)} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                          Sin cobrar · apuntar
                        </button>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          o.status === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : o.cancelledBy === "CUSTOMER" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-600"
                        }`}
                      >
                        {o.status === "DELIVERED" ? "Entregado" : cancelLabel(o)}
                      </span>
                    </span>
                    {collectFor === o.id && (
                      <div className="basis-full">
                        <PaidWithChooser
                          compact
                          title={`¿Cómo pagó el ${orderLabel(o)}?`}
                          busy={updating === o.id}
                          onCancel={() => setCollectFor(null)}
                          onPick={(m) => {
                            setCollectFor(null);
                            handleStatus(o.id, null, m);
                          }}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      )}
    </div>
  );
}
