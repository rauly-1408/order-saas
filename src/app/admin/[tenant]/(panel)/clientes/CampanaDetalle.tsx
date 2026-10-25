"use client";

import { ask } from "@/app/lib/dialog";
import { useCallback, useEffect, useState } from "react";
import { SEGMENT_LABEL, type Segment } from "@/app/lib/retention";
import { card, ghostBtn } from "./types";

type Send = {
  id: string;
  status: "PENDING" | "SENT" | "FAILED" | "CONVERTED";
  sentAt: string | null;
  convertedAt: string | null;
  name: string | null;
  phone: string;
  optedOut: boolean;
  message: string;
  waLink: string | null;
};

type Detail = {
  campaign: { id: string; name: string; status: string; targetSegment: Segment; couponCode: string | null };
  sends: Send[];
};

const SEND_STATUS: Record<Send["status"], { text: string; cls: string }> = {
  PENDING: { text: "Pendiente", cls: "bg-black/[0.04] text-[var(--p-muted)]" },
  SENT: { text: "Enviado", cls: "bg-[var(--p-brand-soft)] text-[var(--p-brand)]" },
  CONVERTED: { text: "Volvió a pedir", cls: "bg-emerald-50 text-emerald-700" },
  FAILED: { text: "Descartado", cls: "bg-black/[0.04] text-[var(--p-faint)]" },
};

export default function CampanaDetalle({ api, id, onBack }: { api: string; id: string; onBack: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const url = `${api}/campaigns/${id}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo cargar la campaña");
      setData(json as Detail);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la campaña");
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  async function mark(send: Send, status: "SENT" | "PENDING") {
    setBusy(send.id);
    try {
      const res = await fetch(`${url}/sends/${send.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo actualizar");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!(await ask("¿Anular la campaña? Los mensajes que aún no has enviado se descartan."))) return;
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "CANCELLED" }) });
    if (res.ok) await load();
  }

  const pending = data?.sends.filter((s) => s.status === "PENDING").length ?? 0;
  const done = data ? data.sends.length - pending : 0;
  const total = data?.sends.length ?? 0;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="p-press -ml-2 rounded-full px-2 py-1 text-sm font-medium text-[var(--p-brand)] hover:bg-black/[0.04]">
        ‹ Campañas
      </button>

      {error && <div className="rounded-2xl bg-[var(--p-accent-soft)] px-4 py-3 text-sm text-[var(--p-accent)]">{error}</div>}
      {!data ? (
        !error && <div className="py-16 text-center text-[var(--p-muted)]">Cargando…</div>
      ) : (
        <>
          <div className={`${card} p-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">{data.campaign.name}</h2>
                <p className="text-sm text-[var(--p-muted)]">
                  {SEGMENT_LABEL[data.campaign.targetSegment]} · {data.campaign.couponCode ? `cupón ${data.campaign.couponCode}` : "sin cupón"}
                </p>
              </div>
              {data.campaign.status === "SENDING" && (
                <button onClick={cancel} className={ghostBtn}>
                  Anular campaña
                </button>
              )}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/[0.06]">
              <div className="h-full rounded-full bg-[var(--p-brand)] transition-all duration-700" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <p className="mt-2 text-sm text-[var(--p-muted)]">
              {data.campaign.status === "CANCELLED"
                ? "Campaña anulada"
                : pending
                  ? `${pending} ${pending === 1 ? "mensaje pendiente" : "mensajes pendientes"}. Pulsa “Enviar” en cada cliente: se abre WhatsApp con el mensaje escrito.`
                  : "Todos los mensajes enviados. Los clientes que pidan en los próximos 14 días contarán como recuperados."}
            </p>
          </div>

          <ul className={`${card} divide-y divide-[var(--p-line)] overflow-hidden`}>
            {data.sends.map((s) => {
              const st = SEND_STATUS[s.status];
              return (
                <li key={s.id} className="px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.name ?? "Sin nombre"}</p>
                      <p className="text-xs text-[var(--p-muted)]">{s.phone}{s.optedOut ? " · se dio de baja" : ""}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.cls}`}>{st.text}</span>
                      {s.status === "PENDING" && s.waLink && data.campaign.status === "SENDING" && (
                        <a
                          href={s.waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => mark(s, "SENT")}
                          aria-disabled={busy === s.id}
                          className="p-press rounded-full bg-[#25d366] px-4 py-1.5 text-sm font-semibold text-white"
                        >
                          Enviar por WhatsApp
                        </a>
                      )}
                      {s.status === "SENT" && data.campaign.status !== "CANCELLED" && (
                        <button onClick={() => mark(s, "PENDING")} disabled={busy === s.id} className="p-press rounded-full px-3 py-1 text-xs text-[var(--p-muted)] hover:bg-black/[0.04]">
                          Deshacer
                        </button>
                      )}
                    </div>
                  </div>
                  {s.status === "PENDING" && !s.waLink && !s.optedOut && (
                    <p className="mt-2 text-xs text-[var(--p-accent)]">Este teléfono no parece válido para WhatsApp.</p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
