"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OrderCard from "./OrderCard";
import {
  COLUMNS,
  orderLabel,
  toEuros,
  type ColumnKey,
  type Estimates,
  type Order,
} from "./orderBoard";
import StoreControls, { type StoreLive } from "./StoreControls";
import { playOrderChime, repeatUntilAccepted, setRepeatUntilAccepted, setSoundEnabled, SOUND_EVENT, soundEnabled, unlockAudio } from "../sound";

const POLL_MS = 10_000;
const CLOCK_MS = 15_000;
// Mientras haya pedidos sin aceptar, el aviso se repite (como las tablets de
// Glovo / Uber Eats) para que ninguno se quede olvidado.

type OrdersResponse = { orders: Order[]; history?: Order[]; estimates?: Estimates; store?: StoreLive | null; courierEnabled?: boolean };

const DEFAULT_ESTIMATES: Estimates = { deliveryMinutes: 45, pickupMinutes: 20 };

export default function AdminPanel({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [estimates, setEstimates] = useState<Estimates>(DEFAULT_ESTIMATES);
  const [storeLive, setStoreLive] = useState<StoreLive | null>(null);
  const [courierEnabled, setCourierEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [tab, setTab] = useState<ColumnKey>("NEW");
  const [now, setNow] = useState(() => Date.now());
  // El sonido lo gestiona el aviso global (OrderAlerts); aquí solo el interruptor.
  const [soundOn, setSoundOn] = useState(true);
  const [repeatOn, setRepeatOn] = useState(true);

  const prevIds = useRef<Set<string>>(new Set());
  // Distingue la primera carga de un panel vacío: el primer pedido nuevo sí
  // cambia a la pestaña "Nuevos".
  const initialLoadDone = useRef(false);


  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${tenant}`, { cache: "no-store" });
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
      setError("");
    } catch {
      setError("Sin conexión. Reintentando…");
    } finally {
      setLoading(false);
      setNow(Date.now());
    }
  }, [tenant, router]);

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

  async function handleStatus(orderId: string, newStatus: string) {
    setUpdating(orderId);
    setError("");
    try {
      const res = await fetch(`/api/orders/status/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No se pudo actualizar el pedido");
      }
      await loadOrders();
    } catch {
      setError("Sin conexión. No se pudo actualizar el pedido.");
    } finally {
      setUpdating(null);
    }
  }


  // Repartidor externo: pedir/reintentar (POST) o cancelar (DELETE).
  async function handleCourier(orderId: string, action: "request" | "cancel") {
    setUpdating(orderId);
    setError("");
    try {
      const res = await fetch(`/api/admin/${tenant}/courier/${orderId}`, { method: action === "request" ? "POST" : "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No se pudo gestionar el repartidor");
      }
      await loadOrders();
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setUpdating(null);
    }
  }

  const byColumn = (key: ColumnKey) => {
    const col = COLUMNS.find((c) => c.key === key);
    return col ? orders.filter((o) => col.statuses.includes(o.status)) : [];
  };

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

      {storeLive && <StoreControls tenant={tenant} live={storeLive} onChange={loadOrders} />}

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
              return (
                <section key={col.key} className={tab === col.key ? "block" : "hidden lg:block"}>
                  <h2
                    className={`mb-3 hidden items-center justify-between px-1 text-[15px] font-semibold lg:flex ${col.accent}`}
                  >
                    <span>
                      {col.label}
                    </span>
                    <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-black/[0.05] px-2 text-sm tabular-nums text-[var(--p-ink)]">{list.length}</span>
                  </h2>
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
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <details className="mt-8 rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <summary className="cursor-pointer px-5 py-4 text-[15px] font-semibold">
              Últimas 24 h · {delivered} entregados · {cancelled} cancelados
            </summary>
            {history.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-[var(--p-muted)]">Todavía no hay pedidos cerrados.</p>
            ) : (
              <ul className="divide-y divide-[var(--p-line)] px-4 pb-2">
                {history.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-bold">{orderLabel(o)}</span>{" "}
                      <span className="text-[var(--p-muted)]">{o.customerName}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-[var(--p-muted)]">{toEuros(o.totalCents)}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          o.status === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                        }`}
                      >
                        {o.status === "DELIVERED" ? "Entregado" : "Cancelado"}
                      </span>
                    </span>
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
