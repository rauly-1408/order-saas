"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type RiderOrder = {
  id: string;
  orderNumber: number | null;
  status: "READY" | "DELIVERING";
  paymentStatus: "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REFUNDED";
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  customerPostalCode: string | null;
  notes: string | null;
  createdAt: string;
  items: { id: string; productName: string; quantity: number }[];
};

export default function RepartidorPortal({ tenant }: { tenant: string }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [orders, setOrders] = useState<RiderOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [paymentChoices, setPaymentChoices] = useState<Record<string, "CASH" | "CARD_TERMINAL" | "BIZUM">>({});
  const [error, setError] = useState("");
  const api = `/api/repartidor/${tenant}/pedidos`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(api, { cache: "no-store" });
      const data = await res.json().catch(() => ({})) as { rider?: { name: string }; orders?: RiderOrder[]; error?: string };
      if (res.status === 401) {
        setName("");
        setOrders([]);
        setError("");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las entregas");
      setName(data.rider?.name ?? "");
      setOrders(data.orders ?? []);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy("login");
    setError("");
    try {
      const res = await fetch(`/api/repartidor/${tenant}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({})) as { rider?: { name: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo iniciar sesión");
      setName(data.rider?.name ?? "");
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo iniciar sesión");
    } finally {
      setBusy(null);
    }
  }

  async function updateOrder(order: RiderOrder, status: "DELIVERING" | "DELIVERED", paidWith?: "CASH" | "CARD_TERMINAL" | "BIZUM") {
    setBusy(order.id);
    setError("");
    try {
      const res = await fetch(`${api}/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(paidWith ? { paidWith } : {}) }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo actualizar el pedido");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el pedido");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    await fetch("/api/repartidor/logout", { method: "POST" });
    setName("");
    setOrders([]);
  }

  if (loading && !name) return <main className="grid min-h-screen place-items-center bg-slate-50 p-5 text-slate-500">Cargando…</main>;

  if (!name) return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-5 text-slate-900">
      <form onSubmit={login} className="w-full max-w-sm rounded-3xl bg-white p-7 shadow-xl">
        <div className="mb-5 text-center text-4xl">🚲</div>
        <h1 className="text-center text-2xl font-bold">Acceso repartidores</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Introduce el código de acceso que te ha facilitado el comercio.</p>
        <label className="mt-6 block text-sm font-medium">Código de acceso
          <input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-xl tracking-[0.3em]" placeholder="••••••••••" required />
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button disabled={busy === "login" || code.length !== 10} className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy === "login" ? "Entrando…" : "Entrar"}</button>
      </form>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Panel de repartidor</p><h1 className="text-2xl font-bold">Hola, {name}</h1></div>
          <button onClick={logout} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium">Salir</button>
        </header>
        {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <h2 className="mb-3 text-lg font-semibold">Mis entregas · {orders.length}</h2>
        {orders.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No tienes entregas asignadas ahora mismo.</div> : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li key={order.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3"><strong className="text-xl">Pedido #{order.orderNumber ?? order.id.slice(0, 6)}</strong><span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">{order.status === "READY" ? "Listo para recoger" : "En reparto"}</span></div>
                <p className="mt-3 font-semibold">{order.customerName}</p>
                {order.customerPhone && <a className="text-sm text-slate-600 underline" href={`tel:${order.customerPhone}`}>{order.customerPhone}</a>}
                {order.customerAddress && <p className="mt-2 text-sm">{order.customerAddress}{order.customerPostalCode ? `, ${order.customerPostalCode}` : ""}</p>}
                {order.notes && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Nota: {order.notes}</p>}
                <ul className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{order.items.map((item) => <li key={item.id}>{item.quantity}× {item.productName}</li>)}</ul>
                {order.status === "DELIVERING" && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED" && (
                  <label className="mt-4 block text-sm font-medium text-slate-700">¿Cómo has cobrado?
                    <select value={paymentChoices[order.id] ?? ""} onChange={(e) => setPaymentChoices((current) => ({ ...current, [order.id]: e.target.value as "CASH" | "CARD_TERMINAL" | "BIZUM" }))} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3">
                      <option value="">Selecciona la forma de pago</option>
                      <option value="CASH">Efectivo</option>
                      <option value="CARD_TERMINAL">Tarjeta (TPV)</option>
                      <option value="BIZUM">Bizum</option>
                    </select>
                  </label>
                )}
                <button disabled={busy === order.id || (order.status === "DELIVERING" && order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED" && !paymentChoices[order.id])} onClick={() => void updateOrder(order, order.status === "READY" ? "DELIVERING" : "DELIVERED", paymentChoices[order.id])} className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy === order.id ? "Actualizando…" : order.status === "READY" ? "Recoger pedido" : "Marcar como entregado"}</button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-5 text-center text-xs text-slate-400">Las entregas se actualizan automáticamente cada 15 segundos.</p>
      </div>
    </main>
  );
}
