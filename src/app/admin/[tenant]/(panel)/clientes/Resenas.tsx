"use client";

import { useEffect, useState } from "react";
import { readPanelCache, writePanelCache } from "../panelCache";
import { card } from "./types";

// Reseñas que dejan los clientes al recibir su pedido (página de seguimiento).
// Las de 4-5 estrellas se invitan a Google; las bajas solo las ves tú.

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  order: { orderNumber: number | null; customerName: string; channel: string; totalCents: number };
};
type Data = { reviews: ReviewRow[]; delivered: number };

const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

export default function Resenas({ tenant }: { tenant: string }) {
  const key = `resenas:${tenant}`;
  const [data, setData] = useState<Data | null>(() => readPanelCache<Data>(key) ?? null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "low">("all");

  useEffect(() => {
    fetch(`/api/admin/${tenant}/reviews`, { cache: "no-store" })
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error ?? "No se pudieron cargar las reseñas");
        return json as Data;
      })
      .then((d) => {
        writePanelCache(key, d);
        setData(d);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar las reseñas"));
  }, [tenant, key]);

  if (!data) return error ? <p className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</p> : <p className="py-16 text-center text-[var(--p-muted)]">Cargando…</p>;

  const total = data.reviews.length;
  const avg = total ? data.reviews.reduce((a, r) => a + r.rating, 0) / total : 0;
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, count: data.reviews.filter((r) => r.rating === n).length }));
  const maxCount = Math.max(...dist.map((d) => d.count), 1);
  const shown = filter === "low" ? data.reviews.filter((r) => r.rating <= 3) : data.reviews;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--p-muted)]">
        Al recibir su pedido, el cliente lo valora desde la página de seguimiento. Con 4 o 5 estrellas le invitamos a dejarlo también en Google (enlace en Configuración → Marca → Presencia online); las notas bajas solo te llegan a ti.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={`${card} p-4`}>
          <p className="text-xs text-[var(--p-muted)]">Nota media</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{total ? avg.toLocaleString("es-ES", { maximumFractionDigits: 1 }) : "—"}</p>
          <p className="text-sm tracking-wide text-[var(--p-brand)]" aria-hidden>{total ? stars(Math.round(avg)) : ""}</p>
        </div>
        <div className={`${card} p-4`}>
          <p className="text-xs text-[var(--p-muted)]">Reseñas</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{total}</p>
          <p className="text-xs text-[var(--p-muted)]">{data.delivered ? `${Math.round((total / data.delivered) * 100)}% de los pedidos entregados` : "Aún no hay pedidos entregados"}</p>
        </div>
        <div className={`${card} p-4`}>
          <ul className="space-y-1" aria-label="Reparto de estrellas">
            {dist.map((d) => (
              <li key={d.n} className="flex items-center gap-2 text-xs">
                <span className="w-6 shrink-0 tabular-nums text-[var(--p-muted)]">{d.n}★</span>
                <span className="h-1.5 flex-1 rounded-full bg-black/[0.05]">
                  <span className="block h-full rounded-full bg-[var(--p-brand)]" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex w-fit gap-1 rounded-full bg-black/[0.05] p-1">
        {(
          [
            ["all", "Todas"],
            ["low", "Para mejorar (1-3★)"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`p-press rounded-full px-3 py-1 text-sm font-medium ${filter === k ? "bg-[var(--p-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)]"}`}>
            {l}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className={`${card} p-10 text-center text-sm text-[var(--p-muted)]`}>{total ? "No hay reseñas con esa nota." : "Aún no hay reseñas. Llegarán cuando marques pedidos como entregados."}</p>
      ) : (
        <ul className={`${card} divide-y divide-[var(--p-line)] overflow-hidden`}>
          {shown.map((r) => (
            <li key={r.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className={`tracking-wide ${r.rating <= 3 ? "text-[var(--p-accent)]" : "text-[var(--p-brand)]"}`} aria-label={`${r.rating} de 5 estrellas`}>
                  {stars(r.rating)}
                </span>
                <span className="text-xs text-[var(--p-muted)]">
                  {r.order.customerName} · pedido {r.order.orderNumber != null ? `#${r.order.orderNumber}` : ""} · {new Date(r.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
              </div>
              {r.comment ? <p className="mt-1 text-sm">{r.comment}</p> : <p className="mt-1 text-sm text-[var(--p-faint)]">Sin comentario</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
