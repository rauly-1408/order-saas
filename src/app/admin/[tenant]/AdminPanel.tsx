"use client";
feat(admin): AdminPanel.tsx - KDS with polling, sound, state machineimport { useCallback, useEffect, useRef, useState } from "react";

const euros = (c: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

type OItem = { id: string; productName: string; quantity: number; lineTotalCents: number };
type Order = {
  id: string; status: string; channel: string;
  customerName: string; customerPhone: string; customerAddress: string | null;
  notes: string | null; totalCents: number; createdAt: string; items: OItem[];
};

const LABELS: Record<string,string> = { CREATED:"Nuevo", ACCEPTED:"Aceptado", PREPARING:"Preparando", READY:"Listo" };
const NEXT: Record<string,string|null> = { CREATED:"ACCEPTED", ACCEPTED:"PREPARING", PREPARING:"READY", READY:"COMPLETED", COMPLETED:null, CANCELLED:null };
const NEXT_BTN: Record<string,string> = { CREATED:"Aceptar", ACCEPTED:"Preparando", PREPARING:"Listo", READY:"Entregado" };
const CARD_CLS: Record<string,string> = {
  CREATED:"border-yellow-400 bg-yellow-50",
  ACCEPTED:"border-blue-400 bg-blue-50",
  PREPARING:"border-orange-400 bg-orange-50",
  READY:"border-green-100 bg-green-50",
};
const BADGE_CLS: Record<string,string> = {
  CREATED:"bg-yellow-100 text-yellow-800",
  ACCEPTED:"bg-blue-100 text-blue-800",
  PREPARING:"bg-orange-100 text-orange-800",
  READY:"bg-green-100 text-green-800",
};

function ago(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s/60)} min` : `${Math.floor(s/3600)} h`;
}

function Card({ order, updating, onStatus }: {
  order: Order; updating: string|null;
  onStatus: (id: string, s: string) => void;
}) {
  const next = NEXT[order.status];
  const busy = updating === order.id;
  const isNew = Date.now() - new Date(order.createdAt).getTime() < 120_000;

  return (
    <div className={`relative rounded-2xl border-2 p-4 ${CARD_CLS[order.status] ?? "border-zinc-700 bg-zinc-800"}`}>
      {isNew && <span className="absolute -top-2 -right-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white animate-pulse">NUEVO</span>}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-xs text-zinc-500">{order.id.slice(0,8).toUpperCase()}</div>
          <div className="text-lg font-bold text-zinc-900">{order.customerName}</div>
          <div className="text-sm text-zinc-600">{order.customerPhone}</div>
        </div>
        <div className="text-right shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE_CLS[order.status]??""}`}>{LABELS[order.status]??order.status}</span>
          <div className="mt-1 text-xs text-zinc-500">{ago(order.createdAt)}</div>
          <div className="text-xs text-zinc-500">{order.channel === "DELIVERY" ? "🛵 Delivery" : "🥡 Recogida"}</div>
        </div>
      </div>
      <div className="mb-3 space-y-1">
        {order.items.map(i => (
          <div key={i.id} className="flex justify-between text-sm text-zinc-700">
            <span>{i.quantity}× {i.productName}</span>
            <span>{euros(i.lineTotalCents)}</span>
          </div>
        ))}
      </div>
      {order.customerAddress && (
        <div className="mb-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-zinc-600">📍 {order.customerAddress}</div>
      )}
      {order.notes && (
        <div className="mb-3 rounded-lg bg-white/60 px-3 py-2 text-xs text-zinc-600">📝 {order.notes}</div>
      )}
      <div className="flex items-center justify-between">
        <div className="font-bold text-zinc-900">{euros(order.totalCents)}</div>
        <div className="flex gap-2">
          {order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <button onClick={() => onStatus(order.id, "CANCELLED")} disabled={busy}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              Cancelar
            </button>
          )}
          {next && (
            <button onClick={() => onStatus(order.id, next)} disabled={busy}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">
              {busy ? "..." : (NEXT_BTN[order.status] ?? next)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel({ tenant }: { tenant: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string|null>(null);
  const prevIds = useRef<Set<string>>(new Set());
  const audio = useRef<HTMLAudioElement|null>(null);

  const fetch$ = useCallback(async () => {
    const res = await fetch(`/api/orders/${tenant}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const incoming: Order[] = data.orders ?? [];
    const hasNew = incoming.some(o => !prevIds.current.has(o.id));
    if (hasNew && prevIds.current.size > 0) {
      audio.current?.play().catch(()=>null);
      if (document.hidden) document.title = "🔔 Nuevo pedido!";
    }
    prevIds.current = new Set(incoming.map(o => o.id));
    setOrders(incoming);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    fetch$();
    const iv = setInterval(fetch$, 10_000);
    const vis = () => { if (!document.hidden) document.title = `Admin · ${tenant}`; };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [fetch$, tenant]);

  async function handleStatus(id: string, status: string) {
    setUpdating(id);
    await fetch(`/api/orders/status/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await fetch$();
    setUpdating(null);
  }

  const active = orders.filter(o => ["CREATED","ACCEPTED","PREPARING"].includes(o.status));
  const ready  = orders.filter(o => o.status === "READY");

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-white">
      <audio ref={audio} src="/notify.mp3" preload="auto" />
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold capitalize">{tenant}</h1>
          <p className="text-sm text-zinc-400">Panel de pedidos · actualiza cada 10 s</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-green-400" />
          <button onClick={() => audio.current?.play().catch(()=>null)}
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs hover:bg-zinc-800">
            🔔 Test sonido
          </button>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-20 text-zinc-400">Cargando...</div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <div className="mb-2 text-4xl">🍽️</div>
          <p className="font-semibold">Sin pedidos activos</p>
          <p className="text-sm">Los nuevos pedidos aparecerán aquí automáticamente</p>
        </div>
      ) : (
        <div className="space-y-8">
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Activos ({active.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {active.map(o => <Card key={o.id} order={o} updating={updating} onStatus={handleStatus} />)}
              </div>
            </section>
          )}
          {ready.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-green-400">
                Listos ({ready.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {ready.map(o => <Card key={o.id} order={o} updating={updating} onStatus={handleStatus} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
