"use client";

import { useEffect, useState } from "react";
import { Card, euros } from "../ui";

type Billing = { addons: string[]; feePercent: number; since: string; months: { month: string; orders: number; totalCents: number; feeCents: number }[]; hidden?: boolean };

const MODULES: { key: string; name: string; what: string }[] = [
  { key: "RETENTION", name: "Retención", what: "Clientes, cupones, campañas y atribución de ventas." },
  { key: "COSTS", name: "Costes y margen", what: "Escandallos, inventario, compras y margen por plato." },
];

const monthName = (ym: string) => new Date(`${ym}-01T12:00:00`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });

// Plan y facturación, como Shopify: qué tienes contratado y la comisión de los
// pedidos pagados online, que se factura aparte cada mes.
export default function Plan({ tenant }: { tenant: string }) {
  const [data, setData] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/admin/${tenant}/billing`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setData)
      .catch(() => setError("No se pudo cargar la facturación"));
  }, [tenant]);
  if (!data) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;

  return (
    <div className="space-y-5">
      <Card title="Tu plan" description={`Cliente desde ${new Date(data.since).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}. Pedidos, carta, tienda online, pagos y reparto están incluidos.`}>
        <ul className="divide-y divide-[var(--p-line)]">
          {MODULES.map((m) => {
            const on = data.addons.includes(m.key);
            return (
              <li key={m.key} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold">{m.name}</span>
                  <span className="block text-xs text-[var(--p-muted)]">{m.what}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${on ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.05] text-[var(--p-muted)]"}`}>{on ? "Contratado" : "No contratado"}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-[var(--p-muted)]">Para activar o quitar un módulo, escribe al equipo de la plataforma.</p>
      </Card>

      <Card title="Comisión por pedidos online" description={`${data.feePercent} % de cada pedido pagado online, aparte de lo que cobre tu pasarela. Los pedidos pagados en persona no tienen comisión. Se factura a final de mes.`}>
        {data.hidden ? (
          <p className="text-sm text-[var(--p-muted)]">Los importes los ve quien tiene el permiso «Ve lo recaudado».</p>
        ) : (
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="text-xs text-[var(--p-muted)]">
              <tr>
                <th className="px-5 py-2 font-medium sm:px-6">Mes</th>
                <th className="px-2 py-2 text-right font-medium">Pedidos online</th>
                <th className="px-2 py-2 text-right font-medium">Cobrado</th>
                <th className="px-5 py-2 text-right font-medium sm:px-6">Comisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--p-line)] tabular-nums">
              {data.months.map((m) => (
                <tr key={m.month}>
                  <td className="px-5 py-2.5 capitalize sm:px-6">{monthName(m.month)}</td>
                  <td className="px-2 py-2.5 text-right">{m.orders}</td>
                  <td className="px-2 py-2.5 text-right">{euros(m.totalCents)}</td>
                  <td className="px-5 py-2.5 text-right font-semibold sm:px-6">{euros(m.feeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}
