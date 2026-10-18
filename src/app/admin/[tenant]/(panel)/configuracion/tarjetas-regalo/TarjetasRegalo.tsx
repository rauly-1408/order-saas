"use client";

import { useEffect, useState } from "react";
import { Card, Msg, euros, ghostBtn, input, primaryBtn } from "../ui";

type GiftCard = { id: string; code: string; initialCents: number; balanceCents: number; active: boolean; expiresAt: string | null; note: string | null; createdAt: string; _count: { orders: number } };

// Tarjetas regalo: las creas aquí (las vendes en el local o las regalas) y el
// cliente escribe el código al pagar. El saldo que no gasta se queda en la tarjeta.
export default function TarjetasRegalo({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/giftcards`;
  const [cards, setCards] = useState<GiftCard[] | null>(null);
  const [form, setForm] = useState({ amount: "25", note: "", expiresAt: "" });
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d) => setCards(d.cards))
      .catch(() => setMsg({ ok: false, text: "No se pudieron cargar las tarjetas" }));
  }, [api]);

  async function send(method: "POST" | "PATCH", body: unknown) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(api, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Algo ha fallado");
      setCards(json.cards);
      if (json.created) setCreated(json.created);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Algo ha fallado" });
    } finally {
      setBusy(false);
    }
  }

  const amountCents = Math.round(Number(form.amount.replace(",", ".")) * 100);
  const live = cards?.filter((c) => c.active && c.balanceCents > 0) ?? [];

  return (
    <div className="space-y-5">
      <Card title="Crear tarjeta regalo" description="Se genera un código único. Cóbrala en el local como cualquier venta y entrega el código al cliente (impreso o por WhatsApp).">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs text-[var(--p-muted)]">
            Importe (€)
            <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
          </label>
          <label className="text-xs text-[var(--p-muted)]">
            Para quién / nota (opcional)
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Regalo de cumpleaños Ana" className={input} />
          </label>
          <label className="text-xs text-[var(--p-muted)]">
            Caduca (opcional)
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={input} />
          </label>
        </div>
        <button type="button" disabled={busy || !(amountCents >= 100)} onClick={() => send("POST", { amountCents, note: form.note, expiresAt: form.expiresAt || undefined })} className={`${primaryBtn} mt-4`}>
          {busy ? "Creando…" : `Crear tarjeta de ${amountCents >= 100 ? euros(amountCents) : "…"}`}
        </button>
        {created && (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
            <p className="font-semibold">Tarjeta creada</p>
            <p className="mt-1 font-mono text-lg tracking-wider">{created}</p>
            <button type="button" onClick={() => navigator.clipboard?.writeText(created)} className="mt-1 text-xs font-semibold underline">
              Copiar código
            </button>
          </div>
        )}
        <Msg msg={msg} />
      </Card>

      <Card title="Tarjetas" description={cards ? `${live.length} con saldo · ${euros(live.reduce((t, c) => t + c.balanceCents, 0))} pendientes de canjear` : undefined}>
        {!cards ? (
          <p className="text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-[var(--p-muted)]">Todavía no has creado ninguna. En cuanto haya una, el checkout muestra el campo «Tarjeta regalo».</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-[var(--p-muted)]">
                <tr>
                  <th className="px-5 py-2 font-medium sm:px-6">Código</th>
                  <th className="px-2 py-2 font-medium">Saldo</th>
                  <th className="px-2 py-2 font-medium">Pedidos</th>
                  <th className="px-2 py-2 font-medium">Nota</th>
                  <th className="px-5 py-2 sm:px-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--p-line)]">
                {cards.map((c) => (
                  <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                    <td className="px-5 py-2.5 font-mono text-[13px] sm:px-6">{c.code}</td>
                    <td className="px-2 py-2.5 tabular-nums">
                      {euros(c.balanceCents)} <span className="text-xs text-[var(--p-muted)]">de {euros(c.initialCents)}</span>
                    </td>
                    <td className="px-2 py-2.5 tabular-nums">{c._count.orders}</td>
                    <td className="max-w-[160px] truncate px-2 py-2.5 text-xs text-[var(--p-muted)]">
                      {c.note}
                      {c.expiresAt && ` · caduca ${new Date(c.expiresAt).toLocaleDateString("es-ES")}`}
                    </td>
                    <td className="px-5 py-2.5 text-right sm:px-6">
                      <button type="button" disabled={busy} onClick={() => send("PATCH", { id: c.id, active: !c.active })} className={`${ghostBtn} !px-3 !py-1 text-xs`}>
                        {c.active ? "Desactivar" : "Activar"}
                      </button>
                    </td>
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
