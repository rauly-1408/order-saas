"use client";

import { useEffect, useState } from "react";

// Configuración → Pagos: como Shopify, cada restaurante conecta SU pasarela
// (Redsys de su banco, Stripe…) y el dinero le entra directamente.
// Ver docs/PAGOS.md

type Provider = "NONE" | "TEST" | "STRIPE" | "REDSYS";
type Redsys = { merchantCode: string; terminal: string; env: "test" | "live" };
type View = {
  provider: Provider;
  payInStore: boolean;
  bizum: boolean;
  redsys: Redsys;
  hasRedsysKey: boolean;
  stripe: { mode: "test" | "live" | null; hasWebhookSecret: boolean };
  notifyUrl: string;
  feePercent: number;
  month: { orders: number; totalCents: number; feeCents: number };
};
type Form = { provider: Provider; payInStore: boolean; bizum: boolean; redsys: Redsys; redsysKey: string; stripeKey: string; stripeWebhook: string };

const card = "rounded-[18px] bg-[var(--p-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6";
const input = "mt-1 w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const euros = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

const OPTIONS: { value: Provider; label: string; hint: string }[] = [
  { value: "NONE", label: "Sin pago online", hint: "El cliente paga al recoger o al recibir el pedido." },
  { value: "REDSYS", label: "Redsys (TPV de tu banco)", hint: "El TPV virtual de tu banco. Tarjeta y Bizum." },
  { value: "STRIPE", label: "Stripe", hint: "Tarjeta, Apple Pay y Google Pay. Alta en minutos." },
  { value: "TEST", label: "Modo prueba", hint: "Para probar el pago sin cobrar nada." },
];

export default function Pagos({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/payments`;
  const [view, setView] = useState<View | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function load(v: View) {
    setView(v);
    setForm({ provider: v.provider, payInStore: v.payInStore, bizum: v.bizum, redsys: v.redsys, redsysKey: "", stripeKey: "", stripeWebhook: "" });
  }

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then(async (r) => (r.ok ? load(await r.json()) : setMsg({ ok: false, text: "No se pudo cargar la configuración de pagos" })))
      .catch(() => setMsg({ ok: false, text: "No se pudo cargar la configuración de pagos" }));
  }, [api]);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      load(json);
      setMsg({ ok: true, text: "Guardado." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo guardar" });
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    const json = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) })
      .then((r) => r.json())
      .catch(() => ({ ok: false, message: "Sin conexión" }));
    setMsg({ ok: json.ok === true, text: json.message ?? "" });
    setBusy("");
  }

  if (!form || !view) return <div className={card}><p className="text-sm text-[var(--p-muted)]">{msg?.text ?? "Cargando…"}</p></div>;
  const r = form.redsys;
  const setR = (patch: Partial<Redsys>) => setForm({ ...form, redsys: { ...r, ...patch } });

  return (
    <div className="space-y-5">
      <section className={card}>
        <p className="text-[15px] font-semibold">Pasarela de pago</p>
        <p className="mt-1 text-sm text-[var(--p-muted)]">Conecta la tuya: el dinero entra directamente en tu cuenta. Nosotros nunca tocamos los cobros.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <label key={o.value} className={`cursor-pointer rounded-xl border p-3 text-sm ${form.provider === o.value ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)]" : "border-[var(--p-line)]"}`}>
              <input type="radio" name="pay-provider" className="sr-only" checked={form.provider === o.value} onChange={() => setForm({ ...form, provider: o.value })} />
              <span className="block font-semibold">{o.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--p-muted)]">{o.hint}</span>
            </label>
          ))}
        </div>

        {form.provider === "REDSYS" && (
          <div className="mt-5 space-y-3 text-sm">
            <p className="text-xs text-[var(--p-muted)]">
              Pide a tu banco el <b>TPV virtual (Redsys)</b>. Te darán el código de comercio (FUC), el terminal y una clave secreta (la ves en el portal de Redsys de tu banco). Empieza en el entorno de pruebas.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-[var(--p-muted)]">
                Código de comercio (FUC)
                <input value={r.merchantCode} onChange={(e) => setR({ merchantCode: e.target.value })} inputMode="numeric" placeholder="9 cifras" className={input} />
              </label>
              <label className="text-xs text-[var(--p-muted)]">
                Terminal
                <input value={r.terminal} onChange={(e) => setR({ terminal: e.target.value })} inputMode="numeric" className={input} />
              </label>
              <label className="text-xs text-[var(--p-muted)]">
                Entorno
                <select value={r.env} onChange={(e) => setR({ env: e.target.value === "live" ? "live" : "test" })} className={`${input} bg-transparent`}>
                  <option value="test">Pruebas</option>
                  <option value="live">Real</option>
                </select>
              </label>
            </div>
            <label className="block text-xs text-[var(--p-muted)]">
              Clave secreta (SHA-256)
              <input
                type="password"
                value={form.redsysKey}
                onChange={(e) => setForm({ ...form, redsysKey: e.target.value })}
                placeholder={view.hasRedsysKey ? "Clave guardada (escribe para cambiarla)" : "32 caracteres"}
                autoComplete="off"
                className={input}
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.bizum} onChange={(e) => setForm({ ...form, bizum: e.target.checked })} className="h-4 w-4 accent-[var(--p-brand)]" />
              Ofrecer Bizum <span className="text-xs text-[var(--p-muted)]">(si tu banco lo tiene activado en el TPV)</span>
            </label>
          </div>
        )}

        {form.provider === "STRIPE" && (
          <div className="mt-5 space-y-3 text-sm">
            <p className="text-xs text-[var(--p-muted)]">
              Crea tu cuenta en stripe.com y copia la <b>clave secreta</b> (Desarrolladores → Claves de API). Empieza con la de prueba (sk_test_…).
              {view.stripe.mode && <> Ahora tienes guardada una clave {view.stripe.mode === "live" ? "real" : "de prueba"}.</>}
            </p>
            <label className="block text-xs text-[var(--p-muted)]">
              Clave secreta
              <input
                type="password"
                value={form.stripeKey}
                onChange={(e) => setForm({ ...form, stripeKey: e.target.value })}
                placeholder={view.stripe.mode ? "Clave guardada (escribe para cambiarla)" : "sk_test_… o sk_live_…"}
                autoComplete="off"
                className={input}
              />
            </label>
            <div className="text-xs text-[var(--p-muted)]">
              <p>
                Recomendado: en Stripe → Webhooks, añade esta dirección con los eventos <code>checkout.session.*</code> y pega aquí su secreto de firma. Así se confirma el pago aunque el cliente cierre el navegador.
              </p>
              <input readOnly value={view.notifyUrl} className={`${input} font-mono`} aria-label="Dirección de avisos para Stripe" />
              <input
                type="password"
                value={form.stripeWebhook}
                onChange={(e) => setForm({ ...form, stripeWebhook: e.target.value })}
                placeholder={view.stripe.hasWebhookSecret ? "Secreto guardado (escribe para cambiarlo)" : "whsec_… (opcional)"}
                autoComplete="off"
                className={input}
                aria-label="Secreto de firma del webhook de Stripe"
              />
            </div>
          </div>
        )}

        {form.provider === "TEST" && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Modo prueba: el cliente verá una página con «Pago correcto» y «Pago rechazado». No se cobra nada. Úsalo solo para probar y cámbialo antes de abrir al público.
          </p>
        )}

        {form.provider !== "NONE" && (
          <label className="mt-5 flex items-start gap-2 text-sm">
            <input type="checkbox" checked={form.payInStore} onChange={(e) => setForm({ ...form, payInStore: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--p-brand)]" />
            <span>
              Permitir también pagar al recoger o al recibir
              <span className="block text-xs text-[var(--p-muted)]">Efectivo o datáfono, como hasta ahora.</span>
            </span>
          </label>
        )}

        {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-emerald-700" : "text-[var(--p-accent)]"}`}>{msg.text}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={save} disabled={!!busy} className="p-press rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "save" ? "Guardando…" : "Guardar pagos"}
          </button>
          {view.provider === "STRIPE" && form.provider === "STRIPE" && (
            <button onClick={test} disabled={!!busy} className="p-press rounded-full border border-[var(--p-line)] px-5 py-2.5 text-sm font-medium disabled:opacity-50">
              {busy === "test" ? "Probando…" : "Probar conexión"}
            </button>
          )}
        </div>
      </section>

      <section className={card}>
        <p className="text-[15px] font-semibold">Comisión de la plataforma</p>
        <p className="mt-1 text-sm text-[var(--p-muted)]">
          {view.feePercent} % de cada pedido pagado online, aparte de lo que cobre tu pasarela. Pagar al recoger o al recibir no tiene comisión. Se factura a final de mes.
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-black/[0.03] px-2 py-3">
            <dt className="text-[11px] text-[var(--p-muted)]">Pedidos online este mes</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{view.month.orders}</dd>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-2 py-3">
            <dt className="text-[11px] text-[var(--p-muted)]">Cobrado online</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{euros(view.month.totalCents)}</dd>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-2 py-3">
            <dt className="text-[11px] text-[var(--p-muted)]">Comisión</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{euros(view.month.feeCents)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
