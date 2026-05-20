"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const toEuros = (c: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

type OItem = {
  id: string;
  productName: string;
  quantity: number;
  lineTotalCents: number;
};

type Order = {
  id: string;
  status: string;
  channel: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  notes: string | null;
  totalCents: number;
  createdAt: string;
  items: OItem[];
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Nuevo",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
};

const STATUS_NEXT: Record<string, string | null> = {
  CREATED: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
  COMPLETED: null,
  CANCELLED: null,
};

const STATUS_BTN: Record<string, string> = {
  CREATED: "Aceptar",
  ACCEPTED: "Preparando",
  PREPARING: "Listo",
  READY: "Entregado",
};

const CARD_CLS: Record<string, string> = {
  CREATED: "border-yellow-400 bg-yellow-50",
  ACCEPTED: "border-blue-400 bg-blue-50",
  PREPARING: "border-orange-400 bg-orange-50",
  READY: "border-green-400 bg-green-50",
};

const BADGE_CLS: Record<string, string> = {
  CREATED: "bg-yellow-100 text-yellow-800",
  ACCEPTED: "bg-blue-100 text-blue-800",
  PREPARING: "bg-orange-100 text-orange-800",
  READY: "bg-green-100 text-green-800",
};

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return secs + "s";
  if (secs < 3600) return Math.floor(secs / 60) + " min";
  return Math.floor(secs / 3600) + " h";
}

function OrderCard({
  order,
  updating,
  onStatus,
}: {
  order: Order;
  updating: string | null;
  onStatus: (id: string, status: string) => void;
}) {
  const nextStatus = STATUS_NEXT[order.status];
  const busy = updating === order.id;
  // Re-evaluated every poll cycle (10s) — the "NUEVO" badge naturally clears on the next render.
  // eslint-disable-next-line react-hooks/purity
  const isNew = Date.now() - new Date(order.createdAt).getTime() < 120_000;

  return (
    <div className={`relative rounded-2xl border-2 p-4 ${CARD_CLS[order.status] ?? "border-zinc-700 bg-zinc-800"}`}>
      {isNew && (
        <span className="absolute -top-2 -right-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse">
          NUEVO
        </span>
      )}

      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-zinc-500">{order.id.slice(0, 8).toUpperCase()}</div>
          <div className="text-lg font-bold text-zinc-900">{order.customerName}</div>
          <div className="text-sm text-zinc-600">{order.customerPhone}</div>
        </div>
        <div className="shrink-0 text-right">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_CLS[order.status] ?? ""}`}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
          <div className="mt-1 text-xs text-zinc-500">{timeAgo(order.createdAt)}</div>
          <div className="text-xs text-zinc-500">
            {order.channel === "DELIVERY" ? "Delivery" : "Recogida"}
          </div>
        </div>
      </div>

      <div className="mb-3 space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-zinc-700">
            <span>{item.quantity}x {item.productName}</span>
            <span>{toEuros(item.lineTotalCents)}</span>
          </div>
        ))}
      </div>

      {order.channel === "DELIVERY" && order.customerAddress && (
        <div className="mb-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-zinc-600">
          Direccion: {order.customerAddress}
        </div>
      )}

      {order.notes && (
        <div className="mb-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-zinc-600">
          Notas: {order.notes}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="font-bold text-zinc-900">{toEuros(order.totalCents)}</div>
        <div className="flex gap-2">
          {order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <button
              onClick={() => onStatus(order.id, "CANCELLED")}
              disabled={busy}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          {nextStatus && (
            <button
              onClick={() => onStatus(order.id, nextStatus)}
              disabled={busy}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {busy ? "..." : (STATUS_BTN[order.status] ?? nextStatus)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type AudioCtor = typeof AudioContext;

function playBeep(ctxRef: React.MutableRefObject<AudioContext | null>) {
  try {
    if (typeof window === "undefined") return;
    const Ctor: AudioCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return;
    if (!ctxRef.current) ctxRef.current = new Ctor();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => null);

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(660, now + 0.12);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  } catch {
    // browser blocked audio, swallow
  }
}

export default function AdminPanel({ tenant }: { tenant: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const prevIds = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${tenant}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { orders: Order[] };
      const incoming = data.orders ?? [];
      const hasNew = incoming.some((o) => !prevIds.current.has(o.id));
      if (hasNew && prevIds.current.size > 0) {
        playBeep(audioCtxRef);
        if (document.hidden) document.title = "Nuevo pedido!";
      }
      prevIds.current = new Set(incoming.map((o) => o.id));
      setOrders(incoming);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 10_000);
    const onVisibility = () => {
      if (!document.hidden) document.title = "Admin - " + tenant;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loadOrders, tenant]);

  async function handleStatus(orderId: string, newStatus: string) {
    setUpdating(orderId);
    try {
      await fetch(`/api/orders/status/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await loadOrders();
    } finally {
      setUpdating(null);
    }
  }

  const active = orders.filter((o) => ["CREATED", "ACCEPTED", "PREPARING"].includes(o.status));
  const ready = orders.filter((o) => o.status === "READY");

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-white">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold capitalize">{tenant}</h1>
          <p className="text-sm text-zinc-400">Panel de pedidos - actualiza cada 10 s</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-green-400" />
          <button
            onClick={() => playBeep(audioCtxRef)}
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
          >
            Test sonido
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20 text-zinc-400">Cargando...</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <p className="text-4xl mb-2">-</p>
          <p className="font-semibold">Sin pedidos activos</p>
          <p className="text-sm">Los nuevos pedidos apareceran aqui automaticamente</p>
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Activos ({active.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.map((o) => (
                  <OrderCard key={o.id} order={o} updating={updating} onStatus={handleStatus} />
                ))}
              </div>
            </section>
          )}
          {ready.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-green-400">
                Listos ({ready.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ready.map((o) => (
                  <OrderCard key={o.id} order={o} updating={updating} onStatus={handleStatus} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
