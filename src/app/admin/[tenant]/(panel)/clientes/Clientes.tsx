"use client";

import { useMemo, useState } from "react";
import { daysSince, SEGMENT_LABEL, type Segment } from "@/app/lib/retention";
import { card, euros, SEGMENT_STYLE, type CustomerRow, type Overview } from "./types";

const SEGMENT_HINT: Record<Segment, string> = {
  NEW: "Han pedido una vez",
  REGULAR: "Repiten",
  VIP: "Tus mejores clientes",
  AT_RISK: "Hace más de 30 días que no piden",
};

function lastOrderText(c: CustomerRow): string {
  const d = daysSince(c.lastOrderAt ? new Date(c.lastOrderAt) : null);
  if (d == null) return "Sin pedidos";
  if (d === 0) return "Pidió hoy";
  if (d === 1) return "Pidió ayer";
  return `Pidió hace ${d} días`;
}

export default function Clientes({
  data,
  api,
  onSaved,
  onNewCampaign,
}: {
  data: Overview;
  api: string;
  onSaved: () => Promise<void>;
  onNewCampaign: () => void;
}) {
  const [filter, setFilter] = useState<Segment | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const reachable = data.customers.filter((c) => c.marketingConsent).length;
  const atRisk = data.segments.find((s) => s.segment === "AT_RISK");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return data.customers.filter(
      (c) =>
        (!filter || c.segment === filter) &&
        (!q || (c.name ?? "").toLowerCase().includes(q) || (qDigits.length >= 3 && c.phone.includes(qDigits)))
    );
  }, [data.customers, filter, query]);

  async function optOut(c: CustomerRow) {
    if (!window.confirm(`¿Dar de baja a ${c.name ?? c.phone}? Dejará de recibir campañas.`)) return;
    setBusy(c.id);
    setError("");
    try {
      const res = await fetch(`${api}/customers/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingConsent: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo dar de baja");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo dar de baja");
    } finally {
      setBusy(null);
    }
  }

  if (data.customers.length === 0) {
    return (
      <div className={`${card} p-10 text-center`}>
        <p className="font-semibold">Todavía no hay clientes</p>
        <p className="mt-1 text-sm text-[var(--p-muted)]">Cada pedido online crea o actualiza su ficha automáticamente.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Aviso principal: clientes en riesgo a los que se puede escribir */}
      {atRisk && atRisk.reachable > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--p-warm)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-[var(--p-brand)]">
              {atRisk.reachable} {atRisk.reachable === 1 ? "cliente habitual lleva" : "clientes habituales llevan"} más de un mes sin pedir
            </p>
            <p className="text-sm text-[var(--p-brand)]/70">Mándales un mensaje con un cupón para que vuelvan.</p>
          </div>
          <button onClick={onNewCampaign} className="p-press shrink-0 self-start rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white sm:self-auto">
            Crear campaña
          </button>
        </div>
      )}

      {/* Segmentos: también funcionan como filtro */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {data.segments.map((s) => {
          const active = filter === s.segment;
          return (
            <button
              key={s.segment}
              onClick={() => setFilter(active ? null : s.segment)}
              className={`p-lift p-press rounded-2xl p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5 ${
                active ? "bg-[var(--p-brand)] text-white" : "bg-[var(--p-surface)]"
              }`}
            >
              <p className={`text-sm ${active ? "text-white/80" : "text-[var(--p-muted)]"}`}>{SEGMENT_LABEL[s.segment]}</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{s.count}</p>
              <p className={`mt-1 text-xs ${active ? "text-white/80" : "text-[var(--p-faint)]"}`}>{SEGMENT_HINT[s.segment]}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none sm:max-w-xs"
        />
        <p className="text-sm text-[var(--p-muted)]">
          {reachable} de {data.customers.length} aceptan recibir ofertas
        </p>
      </div>

      {error && <div className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>}

      {rows.length === 0 ? (
        <p className={`${card} p-10 text-center text-sm text-[var(--p-muted)]`}>Ningún cliente coincide con la búsqueda.</p>
      ) : (
        <ul className={`${card} divide-y divide-[var(--p-line)] overflow-hidden`}>
          {rows.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-sm font-semibold">
                  {(c.name ?? "?").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name ?? "Sin nombre"}</p>
                  <p className="text-xs text-[var(--p-muted)]">
                    {c.phone} · {lastOrderText(c)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-[52px] sm:pl-0">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEGMENT_STYLE[c.segment]}`}>{SEGMENT_LABEL[c.segment]}</span>
                <span className="text-xs text-[var(--p-muted)] tabular-nums">
                  {c.ordersCount} {c.ordersCount === 1 ? "pedido" : "pedidos"} · {euros(c.totalSpentCents)}
                </span>
                {c.marketingConsent ? (
                  <button
                    onClick={() => optOut(c)}
                    disabled={busy === c.id}
                    title="Dar de baja de las campañas"
                    className="p-press rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    Acepta ofertas ✕
                  </button>
                ) : (
                  <span className="whitespace-nowrap rounded-full bg-black/[0.04] px-2.5 py-1 text-xs text-[var(--p-muted)]" title="No ha dado permiso para recibir ofertas: no entra en las campañas">No quiere ofertas</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
