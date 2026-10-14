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
import { playBeep, unlockAudio } from "./sound";

const POLL_MS = 10_000;
const CLOCK_MS = 15_000;
// Mientras haya pedidos sin aceptar, el aviso se repite (como las tablets de
// Glovo / Uber Eats) para que ninguno se quede olvidado.
const REMIND_MS = 15_000;

type OrdersResponse = { orders: Order[]; history?: Order[]; estimates?: Estimates };

const DEFAULT_ESTIMATES: Estimates = { deliveryMinutes: 45, pickupMinutes: 20 };

export default function AdminPanel({ tenant }: { tenant: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [estimates, setEstimates] = useState<Estimates>(DEFAULT_ESTIMATES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [tab, setTab] = useState<ColumnKey>("NEW");
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);

  const prevIds = useRef<Set<string>>(new Set());
  // Distingue la primera carga (no debe sonar) de un panel vacío (el primer
  // pedido SÍ debe sonar).
  const initialLoadDone = useRef(false);

  const newCount = orders.filter((o) => o.status === "CREATED" || o.status === "ACCEPTED").length;

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
      if (hasNew && initialLoadDone.current) {
        playBeep();
        setTab("NEW");
      }
      prevIds.current = new Set(incoming.map((o) => o.id));
      initialLoadDone.current = true;
      setOrders(incoming);
      setHistory(data.history ?? []);
      if (data.estimates) setEstimates(data.estimates);
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

  // Recordatorio sonoro mientras queden pedidos sin aceptar.
  useEffect(() => {
    if (!soundOn || newCount === 0) return;
    const remind = setInterval(playBeep, REMIND_MS);
    return () => clearInterval(remind);
  }, [soundOn, newCount]);

  // El título de la pestaña muestra los pendientes aunque esté en segundo plano.
  useEffect(() => {
    document.title = newCount > 0 ? `(${newCount}) Nuevos pedidos · ${tenant}` : `Pedidos · ${tenant}`;
  }, [newCount, tenant]);

  async function enableSound() {
    const ok = await unlockAudio();
    setSoundOn(ok);
    if (ok) playBeep();
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
          <h1 className="text-2xl font-bold">Pedidos</h1>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--p-muted)]">
            <span className={`h-2 w-2 rounded-full ${error ? "bg-red-500" : "bg-emerald-400"}`} />
            {error ? "Problema de conexión" : "En directo"}
            {!error && <span className="hidden sm:inline">· actualiza cada 10 s</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={enableSound}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              soundOn
                ? "border-[var(--p-line)] bg-white text-[var(--p-ink)] hover:bg-[var(--p-bg)]"
                : "border-[var(--p-brand)] bg-[var(--p-brand)] text-white hover:bg-[var(--p-brand-strong)]"
            }`}
          >
            {soundOn ? "🔔 Probar" : "🔕 Activar sonido"}
          </button>
        </div>
      </header>

      {!soundOn && (
        <button
          onClick={enableSound}
          className="mb-4 block w-full rounded-xl bg-[var(--p-brand-soft)]/50 px-4 py-2 text-left text-sm text-[var(--p-brand-strong)] hover:bg-[var(--p-brand-soft)]"
        >
          🔕 El navegador bloquea el sonido hasta que pulses algo. Toca aquí para recibir avisos de pedidos nuevos.
        </button>
      )}

      {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</div>}

      {/* Pestañas con contador (móvil / tablet vertical) */}
      <nav className="mb-4 flex gap-1 overflow-x-auto lg:hidden">
        {COLUMNS.map((col) => {
          const count = byColumn(col.key).length;
          const active = tab === col.key;
          return (
            <button
              key={col.key}
              onClick={() => setTab(col.key)}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
                active ? "bg-white text-[var(--p-brand-strong)] shadow-sm" : "text-[var(--p-muted)]"
              }`}
            >
              {col.emoji} {col.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  col.key === "NEW" && count > 0 ? "bg-amber-400 text-zinc-950" : "bg-[var(--p-line)] text-[var(--p-ink)]"
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
                    className={`mb-3 hidden items-center justify-between border-b-2 pb-2 text-sm font-bold uppercase tracking-wider lg:flex ${col.accent}`}
                  >
                    <span>
                      {col.emoji} {col.label}
                    </span>
                    <span className="text-2xl tabular-nums">{list.length}</span>
                  </h2>
                  <div className="space-y-3">
                    {list.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[var(--p-line)] bg-white/60 py-8 text-center text-sm text-[var(--p-faint)]">
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
                        />
                      ))
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          <details className="mt-8 rounded-xl border border-[var(--p-line)] bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
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
