"use client";

import { useState } from "react";
import { readCheckout, type CheckoutSettings } from "@/app/lib/storePolicies";
import { Card, Msg, Toggle, primaryBtn, useTenantSettings } from "../ui";

export default function PantallaPago({ tenant }: { tenant: string }) {
  const { settings, error, save } = useTenantSettings(tenant);
  const [form, setForm] = useState<CheckoutSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const f = form ?? (settings ? readCheckout(settings) : null);
  if (!f) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  const set = (patch: Partial<CheckoutSettings>) => setForm({ ...f, ...patch });
  const togglePct = (p: number) => set({ tips: { ...f.tips, percents: f.tips.percents.includes(p) ? f.tips.percents.filter((x) => x !== p) : [...f.tips.percents, p].sort((a, b) => a - b) } });

  async function onSave() {
    setBusy(true);
    setMsg(null);
    try {
      await save({ checkout: f });
      setForm(null);
      setMsg({ ok: true, text: "Guardado." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card title="Información del cliente" description="Qué se le pide y qué puede añadir al confirmar el pedido. El nombre y el teléfono son siempre obligatorios.">
        <div className="divide-y divide-[var(--p-line)]">
          <Toggle checked={f.notes} onChange={(v) => set({ notes: v })} label="Notas del pedido" hint="«Sin cebolla», «alergia a los frutos secos»… Llegan a la cocina." />
          <Toggle checked={f.scheduling} onChange={(v) => set({ scheduling: v })} label="Programar el pedido para más tarde" hint="El cliente elige día y hora (también con la tienda cerrada)." />
          <Toggle checked={f.marketingConsent} onChange={(v) => set({ marketingConsent: v })} label="Casilla «Quiero recibir ofertas»" hint="Desmarcada por defecto. Sin ella no puedes enviarle campañas (RGPD)." />
        </div>
      </Card>

      <Card title="Propinas" description="El cliente puede dejar una propina sobre la comida (sin el envío). Se suma al total y la ves en cada pedido.">
        <Toggle checked={f.tips.enabled} onChange={(v) => set({ tips: { ...f.tips, enabled: v } })} label="Pedir propina en la pantalla de pago" />
        {f.tips.enabled && (
          <div className="mt-2">
            <p className="text-xs text-[var(--p-muted)]">Porcentajes que se ofrecen (además de «Sin propina»):</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[5, 10, 15, 20].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePct(p)}
                  aria-pressed={f.tips.percents.includes(p)}
                  className={`p-press rounded-full border px-4 py-1.5 text-sm font-medium ${f.tips.percents.includes(p) ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)]" : "border-[var(--p-line)]"}`}
                >
                  {p} %
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onSave} disabled={busy || !form} className={primaryBtn}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
        <Msg msg={msg} />
      </div>
    </div>
  );
}
