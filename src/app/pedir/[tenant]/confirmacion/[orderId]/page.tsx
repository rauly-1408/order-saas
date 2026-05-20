import Link from "next/link";
import { prisma } from "@/app/lib/prisma";

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

export default async function ConfirmacionPage({
  params,
}: {
  params: Promise<{ tenant: string; orderId: string }>;
}) {
  const { tenant, orderId } = await params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, store: true },
  });

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-zinc-500">Pedido no encontrado.</p>
        <Link href={`/pedir/${tenant}`} className="text-sm font-semibold underline">
          Volver al menú
        </Link>
      </div>
    );
  }

  const etaMinutes = order.channel === "DELIVERY" ? 35 : 20;
  const etaLabel = order.channel === "DELIVERY" ? "de entrega" : "para recoger";

  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <div className="mb-6 text-6xl">✅</div>
      <h1 className="mb-2 text-3xl font-bold">¡Pedido recibido!</h1>
      <p className="mb-8 text-zinc-500">
        Hemos recibido tu pedido correctamente. Te avisaremos cuando esté listo.
      </p>

      <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 text-left">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-500">Pedido</div>
            <div className="font-mono text-lg font-bold">{order.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <div className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
            Confirmado
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-xl bg-zinc-50 p-3">
          <span className="text-2xl">{order.channel === "DELIVERY" ? "🛵" : "🥡"}</span>
          <div>
            <div className="font-semibold">
              {order.channel === "DELIVERY" ? "A domicilio" : "Para recoger"}
            </div>
            <div className="text-sm text-zinc-500">
              Tiempo estimado: ~{etaMinutes} min {etaLabel}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between text-sm">
              <span>{item.quantity}× {item.productName}</span>
              <span>{euros(item.lineTotalCents)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-zinc-100 pt-4">
          {order.feesCents > 0 && (
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Envío</span>
              <span>{euros(order.feesCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span>{euros(order.totalCents)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Link
          href={`/pedir/${tenant}`}
          className="block w-full rounded-xl border border-zinc-300 py-3 text-sm font-semibold hover:bg-zinc-50"
        >
          Volver al menú
        </Link>
      </div>
    </div>
  );
}
