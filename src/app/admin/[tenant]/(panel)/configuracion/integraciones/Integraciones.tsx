"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { card } from "../ui";

// Integraciones: lo que el restaurante conecta con NorApp, como en Shopify o
// Last.app, una tarjeta por servicio con su estado y un botón. Lo que ya existe
// lleva a su apartado; lo que falta se puede solicitar. Ver docs/INTEGRACIONES.md

type Requestable = "glovo" | "ubereats" | "justeat";
type Status = {
  payments: { provider: string; bizum: boolean };
  courier: { provider: string; autoRequest: boolean };
  partnerLinks: string[];
  printers: { count: number; agentOnline: boolean; agentSeenAt: string | null };
  verifactu: { enabled: boolean };
  requests: Partial<Record<Requestable, string>>;
};
type Tone = "on" | "off" | "soon" | "asked";

const TONE: Record<Tone, string> = {
  on: "bg-emerald-50 text-emerald-700",
  off: "bg-black/[0.05] text-[var(--p-muted)]",
  soon: "bg-amber-50 text-amber-800",
  asked: "bg-[var(--p-brand-soft)] text-[var(--p-brand)]",
};
const day = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

function Tile({ initial, name, desc, state, tone, action }: { initial: string; name: string; desc: string; state: string; tone: Tone; action: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-[var(--p-line)] p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--p-bg)] text-sm font-bold text-[var(--p-ink)]">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{name}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{state}</span>
        </div>
      </div>
      <p className="flex-1 text-sm text-[var(--p-muted)]">{desc}</p>
      <div>{action}</div>
    </li>
  );
}

const linkBtn = "p-press inline-flex min-h-11 items-center rounded-full border border-[var(--p-line)] px-4 text-sm font-semibold";

function Group({ title, hint, three = false, children }: { title: string; hint: string; three?: boolean; children: React.ReactNode }) {
  return (
    <section className={card}>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--p-muted)]">{hint}</p>
      <ul className={`mt-4 grid gap-3 sm:grid-cols-2 ${three ? "xl:grid-cols-3" : ""}`}>{children}</ul>
    </section>
  );
}

export default function Integraciones({ tenant }: { tenant: string }) {
  const api = `/api/admin/${tenant}/integraciones`;
  const base = `/admin/${tenant}/configuracion`;
  const [s, setS] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Requestable | null>(null);

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setS)
      .catch(() => setError("No se pudieron cargar las integraciones"));
  }, [api]);

  async function request(key: Requestable) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request: key }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo solicitar");
      setS((cur) => (cur ? { ...cur, requests: json.requests } : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo solicitar");
    } finally {
      setBusy(null);
    }
  }

  if (!s) return <p className="py-10 text-center text-sm text-[var(--p-muted)]">{error || "Cargando las integraciones…"}</p>;

  const platform = (key: Requestable, name: string, initial: string) => {
    const asked = s.requests[key];
    return (
      <Tile
        key={key}
        initial={initial}
        name={name}
        desc={`Los pedidos que te lleguen por ${name} entran solos en Pedidos y salen por la impresora de cocina, sin una tablet de ${name} en la barra. Necesitas tu cuenta de restaurante en ${name}.`}
        state={asked ? `Solicitado el ${day(asked)}` : "Próximamente"}
        tone={asked ? "asked" : "soon"}
        action={
          asked ? (
            <p className="text-sm text-[var(--p-muted)]">Te avisaremos en cuanto esté lista para conectarla.</p>
          ) : (
            <button type="button" disabled={busy === key} onClick={() => request(key)} className="p-press min-h-11 rounded-full bg-[var(--p-brand)] px-4 text-sm font-semibold text-white disabled:opacity-50">
              {busy === key ? "Solicitando…" : "Solicitar"}
            </button>
          )
        }
      />
    );
  };

  const pay = s.payments.provider;
  const payState = pay === "STRIPE" ? "Stripe conectado" : pay === "REDSYS" ? `Redsys conectado${s.payments.bizum ? " · Bizum" : ""}` : pay === "TEST" ? "Modo prueba" : "Sin conectar";
  const courierOn = s.courier.provider !== "NONE";

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-[var(--p-accent)]">{error}</p>}

      <Group three title="Pedidos de las plataformas de reparto" hint="Si vendes en estas apps, recibe sus pedidos en NorApp junto a los de tu tienda. Cada restaurante firma con la plataforma que quiera; aquí solo se conecta.">
        {platform("glovo", "Glovo", "G")}
        {platform("ubereats", "Uber Eats", "U")}
        {platform("justeat", "Just Eat", "J")}
      </Group>

      <Group title="Cobros" hint="Cómo te pagan tus clientes.">
        <Tile
          initial="€"
          name="Pasarela de pago online"
          desc="Cobra con tarjeta (y Bizum con Redsys) en tu tienda online y en la carta QR. El dinero llega a tu cuenta."
          state={payState}
          tone={pay === "NONE" ? "off" : "on"}
          action={<Link href={`${base}/pagos`} className={linkBtn}>{pay === "NONE" ? "Conectar" : "Gestionar"}</Link>}
        />
        <Tile
          initial="D"
          name="Datáfono"
          desc="Cobra con el datáfono que ya tienes de tu banco y márcalo como «Datáfono» en la Caja o en Mesas: cuenta en el cierre de caja y en los informes."
          state="Listo"
          tone="on"
          action={<Link href={`/admin/${tenant}/caja`} className={linkBtn}>Ir a la Caja</Link>}
        />
      </Group>

      <Group title="Reparto" hint="Quién lleva tus pedidos a domicilio.">
        <Tile
          initial="R"
          name="Repartidor externo"
          desc="El cliente pide en tu tienda y pides solo el viaje a Glovo: sin comisión sobre el pedido y el cliente sigue siendo tuyo."
          state={courierOn ? (s.courier.provider === "SIMULATED" ? "Modo prueba" : "Glovo conectado") : "Sin conectar"}
          tone={courierOn ? "on" : "off"}
          action={<Link href={`${base}/entrega#repartidor`} className={linkBtn}>{courierOn ? "Gestionar" : "Conectar"}</Link>}
        />
        <Tile
          initial="⇢"
          name="Botones a las plataformas en tu carta"
          desc="«¿Lo quieres en casa? Escoge quién te lo lleva»: tu carta enlaza a tu ficha en Glovo, Uber Eats o Just Eat. Ese pedido se hace en la plataforma, con su comisión."
          state={s.partnerLinks.length ? s.partnerLinks.join(" · ") : "Sin enlaces"}
          tone={s.partnerLinks.length ? "on" : "off"}
          action={<Link href={`${base}/entrega#plataformas`} className={linkBtn}>{s.partnerLinks.length ? "Gestionar" : "Añadir enlaces"}</Link>}
        />
      </Group>

      <Group title="En el local" hint="Lo que trabaja con NorApp dentro de tu restaurante.">
        <Tile
          initial="⎙"
          name="Impresoras"
          desc="Comandas a cocina y tickets al cliente en tus impresoras de tickets, por la red del local."
          state={s.printers.count ? `${s.printers.count} ${s.printers.count === 1 ? "impresora" : "impresoras"} · ${s.printers.agentOnline ? "programa en marcha" : "programa apagado"}` : "Sin impresoras"}
          tone={s.printers.count && s.printers.agentOnline ? "on" : "off"}
          action={<Link href={`${base}/impresoras`} className={linkBtn}>{s.printers.count ? "Gestionar" : "Añadir"}</Link>}
        />
        <Tile
          initial="V"
          name="VeriFactu · Hacienda"
          desc="Cada cobro emite su factura simplificada con número legal y QR de Hacienda. Obligatorio desde 2027."
          state={s.verifactu.enabled ? "Activado" : "Sin activar"}
          tone={s.verifactu.enabled ? "on" : "off"}
          action={<Link href={`${base}/facturacion`} className={linkBtn}>{s.verifactu.enabled ? "Gestionar" : "Activar"}</Link>}
        />
      </Group>
    </div>
  );
}
