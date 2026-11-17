"use client";

import { useEffect, useState } from "react";
import GiftCardVisual from "@/app/components/GiftCardVisual";
import { readableOn } from "@/app/lib/tenantConfig";
import { Card, Msg, euros, ghostBtn, input, primaryBtn, toast } from "../ui";

type GiftCard = { id: string; code: string; initialCents: number; balanceCents: number; active: boolean; expiresAt: string | null; note: string | null; recipient: string | null; createdAt: string; _count: { orders: number } };
type Brand = { name: string; logoUrl: string | null; color: string };

// Enlace público de la tarjeta (lo que se manda al cliente) y el mensaje de WhatsApp.
const cardLink = (tenant: string, code: string) => `${window.location.origin}/pedir/${tenant}/regalo/${code}`;
const whatsapp = (brand: Brand, c: { code: string; initialCents: number; recipient: string | null }, link: string) =>
  `https://wa.me/?text=${encodeURIComponent(`${c.recipient ? `¡Hola, ${c.recipient}! ` : ""}Tienes una tarjeta regalo de ${euros(c.initialCents)} para ${brand.name} 🎁\nCódigo: ${c.code}\n${link}`)}`;

// Tarjetas regalo: las creas aquí (las vendes en el local o las regalas) y el
// cliente escribe el código al pagar. El saldo que no gasta se queda en la tarjeta.
export default function TarjetasRegalo({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/giftcards`;
  const [cards, setCards] = useState<GiftCard[] | null>(null);
  const [form, setForm] = useState({ amount: "25", recipient: "", note: "", expiresAt: "" });
  const [created, setCreated] = useState<string | null>(null);
  // Nombre, logo y color del local para dibujar la tarjeta.
  const [brand, setBrand] = useState<Brand | null>(null);
  useEffect(() => {
    fetch(`/api/admin/${tenant}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const b = (d.tenant?.branding ?? {}) as Record<string, unknown>;
        setBrand({ name: d.tenant?.name ?? "", logoUrl: (b.logoSquareUrl as string) || (b.logoUrl as string) || null, color: typeof b.primaryColor === "string" && /^#[0-9a-f]{6}$/i.test(b.primaryColor) ? b.primaryColor : "#111111" });
      })
      .catch(() => setBrand({ name: "Tu local", logoUrl: null, color: "#111111" }));
  }, [tenant]);
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
      if (json.created) {
        setCreated(json.created);
        toast("Tarjeta regalo creada");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Algo ha fallado", false);
    } finally {
      setBusy(false);
    }
  }

  const amountCents = Math.round(Number(form.amount.replace(",", ".")) * 100);
  const live = cards?.filter((c) => c.active && c.balanceCents > 0) ?? [];

  return (
    <div className="space-y-5">
      <Card title="Crear tarjeta regalo" description="Cóbrala en el local como cualquier venta y mándasela al cliente por WhatsApp: le llega su tarjeta con tu logo y su código.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-[var(--p-muted)]">
              Importe (€)
              <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={input} />
            </label>
            <label className="text-xs text-[var(--p-muted)]">
              Para (sale en la tarjeta)
              <input value={form.recipient} maxLength={40} onChange={(e) => setForm({ ...form, recipient: e.target.value })} placeholder="Ana" className={input} />
            </label>
            <label className="text-xs text-[var(--p-muted)]">
              Caduca (opcional)
              <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={input} />
            </label>
            <label className="text-xs text-[var(--p-muted)]">
              Nota interna (opcional)
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Pagada con tarjeta" className={input} />
            </label>
            <button
              type="button"
              disabled={busy || !(amountCents >= 100)}
              onClick={() => send("POST", { amountCents, recipient: form.recipient, note: form.note, expiresAt: form.expiresAt || undefined })}
              className={`${primaryBtn} sm:col-span-2 sm:justify-self-start`}
            >
              {busy ? "Creando…" : `Crear tarjeta de ${amountCents >= 100 ? euros(amountCents) : "…"}`}
            </button>
          </div>
          {/* Vista previa: cambia mientras escribes */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--p-muted)]">Así la verá tu cliente</p>
            {!brand ? (
              <div className="aspect-[1.586] w-full animate-pulse rounded-[22px] bg-black/[0.06]" />
            ) : (
            <GiftCardVisual
              storeName={brand.name || "Tu local"}
              logoUrl={brand.logoUrl}
              color={brand.color}
              textColor={readableOn(brand.color)}
              amount={amountCents >= 100 ? euros(amountCents) : "—"}
              recipient={form.recipient.trim() || null}
              code={null}
              expires={form.expiresAt ? new Date(`${form.expiresAt}T12:00:00`).toLocaleDateString("es-ES") : null}
            />
            )}
          </div>
        </div>
        {created && (() => {
          const c = cards?.find((x) => x.code === created);
          const link = cardLink(tenant, created);
          return (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900" role="status">
              <p className="font-semibold">Tarjeta creada · {created}</p>
              <p className="mt-0.5 text-xs">Mándasela al cliente: le llega el enlace con su tarjeta, el saldo y el código.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {c && brand && (
                  <a href={whatsapp(brand, c, link)} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
                    Enviar por WhatsApp
                  </a>
                )}
                <button type="button" onClick={() => navigator.clipboard?.writeText(link).then(() => toast("Enlace copiado"))} className={ghostBtn}>
                  Copiar enlace
                </button>
                <a href={link} target="_blank" rel="noopener noreferrer" className={ghostBtn}>
                  Ver la tarjeta
                </a>
              </div>
            </div>
          );
        })()}
        <Msg msg={msg} />
      </Card>

      <Card title="Tarjetas" description={cards ? `${live.length} con saldo · ${euros(live.reduce((t, c) => t + c.balanceCents, 0))} pendientes de canjear` : undefined}>
        {!cards ? (
          <p className="text-sm text-[var(--p-muted)]">Cargando…</p>
        ) : cards.length === 0 ? (
          <p className="text-sm text-[var(--p-muted)]">Todavía no has creado ninguna. En cuanto haya una, el checkout muestra el campo «Tarjeta regalo».</p>
        ) : (
          <div className="-mx-5 overflow-x-auto sm:-mx-6">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-[var(--p-muted)]">
                <tr>
                  <th className="px-5 py-2 font-medium sm:px-6">Código</th>
                  <th className="px-2 py-2 font-medium">Saldo</th>
                  <th className="px-2 py-2 font-medium">Pedidos</th>
                  <th className="px-2 py-2 font-medium">Para / nota</th>
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
                    <td className="max-w-[180px] truncate px-2 py-2.5 text-xs text-[var(--p-muted)]">
                      {c.recipient && <span className="font-semibold text-[var(--p-ink)]">Para {c.recipient}{c.note ? " · " : ""}</span>}
                      {c.note}
                      {c.expiresAt && ` · caduca ${new Date(c.expiresAt).toLocaleDateString("es-ES")}`}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right sm:px-6">
                      <button type="button" onClick={() => navigator.clipboard?.writeText(cardLink(tenant, c.code)).then(() => toast("Enlace de la tarjeta copiado"))} className={`${ghostBtn} mr-2 !px-3 !py-1 text-xs`}>
                        Copiar enlace
                      </button>
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
