"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  basePriceCents: number;
  lineTotalCents: number;
  modifiersJson: Record<string, unknown>[];
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
  items: OrderItem[];
};

const STATUS_LABELS: Record<string, string> = {
  CREATED: "Nuevo",
  ACCEPTED: "Aceptado",
  PREPARING: "Preparando",
  READY: "Listo",
  COMPLETED: "Completado",
  CANCELLED: "Cancelado",
};

const STATUS_NEXT: Record<string, string | null> = {
  CREATED: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
  COMPLETED: null,
  CANCELLED: null,
};

const STATUS_NEXT_LABEL: Record<string, string> = {
  CREATED: "Aceptar",
  ACCEPTED: "Preparando",
  PREPARING: "Listo",
  READY: "Entregado",
};

const STATUS_COLOR: Record<string, string> = {
  CREATED: "border-yellow-400 bg-yellow-50",
  ACCEPTED: "border-blue-400 bg-blue-50",
  PREPARING: "border-orange-400 bg-orange-50",
  READY: "border-green-400 bg-green-50",
};

const STATUS_BADGE: Record<string, string> = {
  CREATED: "bg-yellow-100 text-yellow-800",
  ACCEPTED: "bg-blue-100 text-blue-800",
  PREPARING: "bg-orange-100 text-orange-800",
  READY: "bg-green-100 text-green-800",
};

function timeAgo(date: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
}

function isNew(date: string) {
  return Date.now() - new Date(date).getTime() < 120_000;
}

export default function AdminPanel({ tenant }: { tenant: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const prevOrderIds = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${tenant}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const incoming: Order[] = data.orders ?? [];

      const newIds = new Set(incoming.map((o) => o.id));
      const hasNew = incoming.some((o) => !prevOrderIds.current.has(o.id));

      if (hasNew && prevOrderIds.current.size > 0) {
        audioRef.current?.play().catch(() => null);
        if (document.hidden) {
          document.title = "🔔 Nuevo pedido! — Admin";
        }
      }

      prevOrderIds.current = newIds;
      setOrders(incoming);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10_000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) document.title = "Panel Admin — " + tenant;
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [tenant]);

  async function changeStatus(orderId: string, newStatus: string) {
    setUpdating(orderId);
    try {
      await fetch(`/api/orders/status/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchOrders();
    } finally {
      setUpdating(null);
    }
  }

  const active = orders.filter((o) => ["CREATED", "ACCEPTED", "PREPARING"].includes(o.status));
  const ready = orders.filter((o) => o.status === "READY");

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-400">Cargando pedidos...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-white">
      <audio ref={audioRef} src="/notify.mp3" preload="auto" />

      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{tenant}</h1>
          <p className="text-sm text-zinc-400">Panel de pedidos · actualiza cada 10 s</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-green-400" />
          <span className="text-sm text-zinc-400">En vivo</span>
          <button
            onClick={() => audioRef.current?.play().catch(() => null)}
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800"
          >
            🔔 Test sonido
          </button>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <div className="mb-2 text-4xl">🍽️</div>
          <p>No hay pedidos activos</p>
          <p className="text-sm">Los nuevos pedidos aparecerán aquí automáticamente</p>
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Activos ({active.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updating}
                    onChangeStatus={changeStatus}
                  />
                ))}
              </div>
            </section>
          )}

          {ready.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-green-400">
                Listos para entregar ({ready.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {ready.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updating}
                    onChangeStatus={changeStatus}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  updating,
  onChangeStatus,
}: {
  order: Order;
  updating: string | null;
  onChangeStatus: (id: string, status: string) => void;
}) {
  const nextStatus = STATUS_NEXT[order.status];
  const isUpdating = updating === order.id;
  const newOrder = isNew(order.createdAt);

  return (
    <div
      className={`relative rounded-2xl border-2 p-4 ${STATUS_COLOR[order.status] ?? "border-zinc-700 bg-zinc-800"}`}
    >
      {newOrder && (
        <span className="absolute -top-2 -right-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          NUEVO
        </span>
      )}

      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-zinc-500">{order.id.slice(0, 8).toUpperCase()}</div>
          <div className="text-lg font-bold text-zinc-900">{order.customerName}</div>
          <div className="text-sm text-zinc-600">{order.customerPhone}</div>
        </div>
        <div className="text-right">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[order.status] ?? ""}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <div className="mt-1 text-xs text-zinc-500">{timeAgo(order.createdAt)}</div>
        </div>
      </div>

      <div className="mb-3 space-y-1">
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-sm text-zinc-700">
            <span>{item.quantity}× {item.productName}</span>
            <span>{euros(item.lineTotalCents)}</span>
          </div>
        ))}
      </div>

      {order.channel === "DELIVERY" && order.customerAddress && (
        <div className="mb-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-zinc-600">
          📍 {order.customerAddress}
        </div>
      )}

      {order.notes && (
        <div className="mb-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-zinc-600">
          📝 {order.notes}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="font-bold text-zinc-900">{euros(order.totalCents)}</div>
        <div className="flex gap-2">
          {order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <button
              onClick={() => onChangeStatus(order.id, "CANCELLED")}
              disabled={isUpdating}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          {nextStatus && (
            <button
              onClick={() => onChangeStatus(order.id, nextStatus)}
              disabled={isUpdating}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {isUpdating ? "..." : (STATUS_NEXT_LABEL[order.status] ?? nextStatus)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
