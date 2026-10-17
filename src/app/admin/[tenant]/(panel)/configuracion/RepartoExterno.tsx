"use client";

import { useEffect, useState } from "react";

// Configuración → Repartidor externo: el pedido se hace en nuestra tienda y
// solo se contrata el repartidor (Glovo On-Demand). Modo prueba para probarlo
// sin contrato. Ver docs/REPARTO-EXTERNO.md

type Provider = "NONE" | "SIMULATED" | "GLOVO";
type Glovo = { clientId: string; keyId: string; scope: string; env: "stage" | "prod" };
type View = {
  provider: Provider;
  autoRequest: boolean;
  glovo: Glovo;
  publicKeyPem: string | null;
  hasWebhookSecret: boolean;
  missing: string[];
  webhookUrl: string;
};

const card = "rounded-[18px] bg-[var(--p-surface)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6";
const input = "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";
const OPTIONS: { value: Provider; label: string; hint: string }[] = [
  { value: "NONE", label: "Desactivado", hint: "Repartes tú o usas «Escoge quién te lo lleva»." },
  { value: "SIMULATED", label: "Modo prueba", hint: "Un repartidor imaginario para probarlo todo sin contrato." },
  { value: "GLOVO", label: "Glovo On-Demand", hint: "Glovo envía un repartidor a recoger tu pedido." },
];

export default function RepartoExterno({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/courier`;
  const [view, setView] = useState<View | null>(null);
  const [form, setForm] = useState<{ provider: Provider; autoRequest: boolean; glovo: Glovo; webhookSecret: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function load(v: View) {
    setView(v);
    setForm({ provider: v.provider, autoRequest: v.autoRequest, glovo: v.glovo, webhookSecret: "" });
  }

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then(async (r) => (r.ok ? load(await r.json()) : setMsg({ ok: false, text: "No se pudo cargar el repartidor externo" })))
      .catch(() => setMsg({ ok: false, text: "No se pudo cargar el repartidor externo" }));
  }, [api]);

  async function send(kind: string, init: RequestInit, done: (json: Record<string, unknown>) => string | null) {
    setBusy(kind);
    setMsg(null);
    try {
      const res = await fetch(api, { ...init, headers: { "Content-Type": "application/json" } });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Algo ha fallado");
      const text = done(json);
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Algo ha fallado" });
    } finally {
      setBusy("");
    }
  }

  const save = () =>
    send("save", { method: "PUT", body: JSON.stringify(form) }, (json) => {
      load(json as unknown as View);
      return "Guardado.";
    });
  const generate = () => {
    if (view?.publicKeyPem && !confirm("¿Generar claves nuevas? Tendrás que enviar la nueva clave pública a Glovo.")) return;
    send("keys", { method: "POST", body: JSON.stringify({ action: "generateKeys" }) }, (json) => {
      load({ ...(json as unknown as View) });
      return "Claves generadas. Envía la clave pública a Glovo.";
    });
  };
  const test = () =>
    send("test", { method: "POST", body: JSON.stringify({ action: "test" }) }, (json) => {
      setMsg({ ok: json.ok === true, text: String(json.message ?? "") });
      return null;
    });

  if (!form || !view) {
    return <div className={card}>{msg ? <p className="text-sm text-[var(--p-accent)]">{msg.text}</p> : <p className="text-sm text-[var(--p-muted)]">Cargando…</p>}</div>;
  }
  const g = form.glovo;
  const setG = (patch: Partial<Glovo>) => setForm({ ...form, glovo: { ...g, ...patch } });

  return (
    <section className={card}>
      <p className="text-[15px] font-semibold">🛵 Repartidor externo</p>
      <p className="mt-1 max-w-xl text-sm text-[var(--p-muted)]">
        El cliente pide y paga en tu tienda y solo contratas el repartidor por viaje: sin comisión sobre el pedido y el cliente sigue siendo tuyo. Necesitas tener activado «Delivery» y tus zonas de reparto: el cliente paga el envío de su zona.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={`cursor-pointer rounded-xl border p-3 text-sm ${form.provider === o.value ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)]" : "border-[var(--p-line)]"}`}
          >
            <input type="radio" name="courier-provider" className="sr-only" checked={form.provider === o.value} onChange={() => setForm({ ...form, provider: o.value })} />
            <span className="block font-semibold">{o.label}</span>
            <span className="mt-0.5 block text-xs text-[var(--p-muted)]">{o.hint}</span>
          </label>
        ))}
      </div>

      {form.provider !== "NONE" && (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.autoRequest} onChange={(e) => setForm({ ...form, autoRequest: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--p-brand)]" />
          <span>
            Pedir el repartidor automáticamente al aceptar un pedido a domicilio
            <span className="block text-xs text-[var(--p-muted)]">Si lo desactivas, lo pides tú con el botón de cada pedido.</span>
          </span>
        </label>
      )}

      {form.provider === "SIMULATED" && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Modo prueba: no viene nadie de verdad. El repartidor «llega» a los pocos minutos, recoge el pedido 1 minuto después de marcarlo como Listo y lo «entrega» a los 8 minutos. Úsalo solo para probar.
        </p>
      )}

      {form.provider === "GLOVO" && (
        <ol className="mt-5 space-y-5 text-sm">
          <li>
            <p className="font-semibold">1. Firma con Glovo On-Demand</p>
            <p className="mt-0.5 text-xs text-[var(--p-muted)]">Pide el alta de empresa en Glovo (servicio On-Demand / Glovo Business). Te darán un Client ID, un Key ID y un Scope.</p>
          </li>
          <li>
            <p className="font-semibold">2. Genera tus claves y envía la clave pública a Glovo</p>
            <button onClick={generate} disabled={!!busy} className="p-press mt-2 rounded-full border border-[var(--p-line)] px-4 py-2 text-sm font-medium disabled:opacity-50">
              {busy === "keys" ? "Generando…" : view.publicKeyPem ? "Generar claves nuevas" : "Generar claves"}
            </button>
            {view.publicKeyPem && (
              <div className="mt-2">
                <textarea readOnly value={view.publicKeyPem} rows={5} className={`${input} font-mono text-[11px]`} aria-label="Clave pública para Glovo" />
                <button onClick={() => navigator.clipboard?.writeText(view.publicKeyPem ?? "")} className="mt-1 text-xs font-semibold text-[var(--p-brand)]">
                  Copiar clave pública
                </button>
              </div>
            )}
            <p className="mt-1 text-xs text-[var(--p-muted)]">La clave privada se guarda cifrada y nunca sale de aquí.</p>
          </li>
          <li>
            <p className="font-semibold">3. Pega los datos que te da Glovo</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-[var(--p-muted)]">
                Client ID
                <input value={g.clientId} onChange={(e) => setG({ clientId: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="text-xs text-[var(--p-muted)]">
                Key ID
                <input value={g.keyId} onChange={(e) => setG({ keyId: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="text-xs text-[var(--p-muted)]">
                Scope
                <input value={g.scope} onChange={(e) => setG({ scope: e.target.value })} placeholder="pandago.api.es.*" className={`${input} mt-1`} />
              </label>
              <label className="text-xs text-[var(--p-muted)]">
                Entorno
                <select value={g.env} onChange={(e) => setG({ env: e.target.value === "prod" ? "prod" : "stage" })} className={`${input} mt-1 bg-transparent`}>
                  <option value="stage">Pruebas de Glovo</option>
                  <option value="prod">Real (repartidores de verdad)</option>
                </select>
              </label>
            </div>
          </li>
          <li>
            <p className="font-semibold">4. Avisos de Glovo (seguimiento en directo)</p>
            <p className="mt-0.5 text-xs text-[var(--p-muted)]">Da a Glovo esta dirección para que te avise de cada cambio, y pega aquí el secreto de firma que te den.</p>
            <input readOnly value={view.webhookUrl} className={`${input} mt-2 font-mono text-xs`} aria-label="Dirección de avisos para Glovo" />
            <input
              type="password"
              value={form.webhookSecret}
              onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
              placeholder={view.hasWebhookSecret ? "Secreto guardado (escribe para cambiarlo)" : "Secreto de firma de Glovo"}
              autoComplete="off"
              className={`${input} mt-2`}
              aria-label="Secreto de firma de los avisos"
            />
          </li>
        </ol>
      )}

      {form.provider === "GLOVO" && view.missing.length > 0 && view.provider === "GLOVO" && (
        <p className="mt-4 rounded-xl bg-[var(--p-accent-soft)] px-3 py-2 text-xs text-[var(--p-accent)]">Falta: {view.missing.join(", ")}. Hasta entonces no se pedirá ningún repartidor.</p>
      )}
      {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-emerald-700" : "text-[var(--p-accent)]"}`}>{msg.text}</p>}

      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={save} disabled={!!busy} className="p-press rounded-full bg-[var(--p-brand)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy === "save" ? "Guardando…" : "Guardar repartidor"}
        </button>
        {view.provider === "GLOVO" && form.provider === "GLOVO" && (
          <button onClick={test} disabled={!!busy} className="p-press rounded-full border border-[var(--p-line)] px-5 py-2.5 text-sm font-medium disabled:opacity-50">
            {busy === "test" ? "Probando…" : "Probar conexión"}
          </button>
        )}
      </div>
    </section>
  );
}
