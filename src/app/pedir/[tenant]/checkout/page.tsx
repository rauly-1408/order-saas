"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/store/cart";

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

type Props = { params: Promise<{ tenant: string }> };

export default function CheckoutPage({ params }: Props) {
  const router = useRouter();
  const { items, subtotalCents, clear } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"TAKEAWAY" | "DELIVERY">("TAKEAWAY");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const subtotal = subtotalCents();
  const fee = channel === "DELIVERY" ? 200 : 0;
  const total = subtotal + fee;
  const count = items.reduce((a, i) => a + i.quantity, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setLoading(true);
    setError("");

    const resolvedParams = await params;
    const tenant = resolvedParams.tenant;

    try {
      const res = await fetch(`/api/orders/${tenant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          customerAddress: channel === "DELIVERY" ? address : undefined,
          channel,
          notes: notes || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            name: item.name,
            basePriceCents: item.unitPriceCents,
            quantity: item.quantity,
            modifiersJson: item.modifiers ? [item.modifiers] : [],
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Error al crear el pedido");
        return;
      }

      const data = await res.json();
      clear();
      router.push(`/pedir/${tenant}/confirmacion/${data.orderId}`);
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-zinc-500">Tu carrito está vacío.</p>
        <button onClick={() => router.back()} className="text-sm font-semibold underline">
          Volver al menú
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8 pb-24">
      <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900">
        ← Volver al menú
      </button>

      <h1 className="mb-6 text-2xl font-bold">Tu pedido</h1>

      {/* Resumen carrito */}
      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between gap-4">
              <div>
                <div className="font-semibold">{item.quantity}× {item.name}</div>
                {item.modifiers?.bread && (
                  <div className="text-sm text-zinc-500">Pan: {item.modifiers.bread}</div>
                )}
                {item.modifiers?.side && (
                  <div className="text-sm text-zinc-500">Acompañamiento: {item.modifiers.side}</div>
                )}
              </div>
              <div className="shrink-0 font-semibold">{euros(item.unitPriceCents * item.quantity)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <div className="flex justify-between text-sm text-zinc-500">
            <span>Subtotal ({count} {count === 1 ? "artículo" : "artículos"})</span>
            <span>{euros(subtotal)}</span>
          </div>
          {fee > 0 && (
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Gastos de envío</span>
              <span>{euros(fee)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between text-base font-bold">
            <span>Total</span>
            <span>{euros(total)}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Canal */}
        <div>
          <p className="mb-2 text-sm font-semibold">¿Cómo lo quieres?</p>
          <div className="grid grid-cols-2 gap-3">
            {(["TAKEAWAY", "DELIVERY"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded-xl border-2 p-3 text-sm font-semibold transition ${
                  channel === c
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 hover:border-zinc-400"
                }`}
              >
                {c === "TAKEAWAY" ? "🥡 Para recoger" : "🛵 A domicilio"}
              </button>
            ))}
          </div>
        </div>

        {/* Datos */}
        <div>
          <label className="mb-1 block text-sm font-semibold">Nombre *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            required
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold">Teléfono *</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+34 600 000 000"
            required
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        {channel === "DELIVERY" && (
          <div>
            <label className="mb-1 block text-sm font-semibold">Dirección de entrega *</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle, número, piso..."
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-semibold">Notas del pedido (opcional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Alergias, instrucciones especiales..."
            rows={3}
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm focus:border-zinc-900 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim() || !phone.trim()}
          className="w-full rounded-xl bg-zinc-900 px-6 py-4 text-base font-bold text-white disabled:opacity-50"
        >
          {loading ? "Enviando pedido..." : `Confirmar pedido · ${euros(total)}`}
        </button>
      </form>
    </div>
  );
}
