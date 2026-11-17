"use client";

import { useEffect, useState } from "react";
import { FOOTER_MAX, readTicket, type TicketSettings } from "@/app/lib/ticketSettings";
import ImageField from "../../personalizacion/ImageField";
import { Card, Toggle, input, toast, useSaveBar, useTenantSettings } from "../ui";

// Configuración → Ticket: cómo sale el ticket del cliente, con vista previa en
// directo (el mismo dibujo que va a la impresora). Ver docs/IMPRESION.md
export default function Ticket({ tenant }: { tenant: string }) {
  const { settings, error, save } = useTenantSettings(tenant);
  const [form, setForm] = useState<TicketSettings | null>(null);
  const f = form ?? (settings ? readTicket(settings) : null);
  if (!f) return <p className="text-sm text-[var(--p-muted)]">{error || "Cargando…"}</p>;
  return <TicketForm tenant={tenant} f={f} dirty={!!form && JSON.stringify(form) !== JSON.stringify(readTicket(settings))} setForm={setForm} save={save} />;
}

function TicketForm({ tenant, f, dirty, setForm, save }: { tenant: string; f: TicketSettings; dirty: boolean; setForm: (v: TicketSettings | null) => void; save: (p: Record<string, unknown>) => Promise<void> }) {
  useSaveBar("ticket", {
    dirty,
    discard: () => setForm(null),
    save: async () => {
      try {
        await save({ ticket: f });
        setForm(null);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", false);
        return false;
      }
    },
  });
  const set = (patch: Partial<TicketSettings>) => setForm({ ...f, ...patch });

  // El logo del ticket es el «Logotipo en blanco y negro» de Marca.
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    fetch(`/api/admin/${tenant}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLogoUrl(((d.tenant?.branding ?? {}) as Record<string, unknown>).logoMonoUrl as string | null ?? null))
      .catch(() => setLogoUrl(null));
  }, [tenant]);

  // Vista previa: se vuelve a dibujar medio segundo después del último cambio.
  const [preview, setPreview] = useState<{ src: string | null; error: string; key: string }>({ src: null, error: "", key: "" });
  const key = JSON.stringify(f) + (logoUrl ?? "");
  useEffect(() => {
    if (logoUrl === undefined) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/${tenant}/ticket/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: f }) }).catch(() => null);
      const d = (await res?.json().catch(() => ({}))) as { src?: string; error?: string } | undefined;
      setPreview(res?.ok && d?.src ? { src: d.src, error: "", key } : (p) => ({ ...p, error: d?.error ?? "Sin conexión: no se pudo dibujar la vista previa", key }));
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- «key» resume f y el logo
  }, [key, tenant]);
  const loading = preview.key !== key;
  // En el móvil la vista previa va plegada (si no, la página pasa de 2 pantallas).
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <div className="min-w-0 space-y-5">
        <Card title="Logo" description="Sale arriba del ticket, en blanco y negro. Mejor un PNG con fondo transparente.">
          <Toggle checked={f.showLogo} onChange={(v) => set({ showLogo: v })} label="Poner mi logo en el ticket" hint="Sin logo, sale el nombre del local en grande." />
        </Card>
        {f.showLogo && logoUrl !== undefined && <ImageField tenant={tenant} kind="LOGO_MONO" url={logoUrl} onChange={(u) => setLogoUrl(u)} />}

        <Card title="Qué datos salen" description="Con factura simplificada, la razón social, el NIF, la dirección y el IVA salen siempre: son obligatorios.">
          <div className="divide-y divide-[var(--p-line)]">
            <Toggle checked={f.showLegal} onChange={(v) => set({ showLegal: v })} label="Razón social" hint="El nombre legal de la empresa. Se cambia en Información del negocio." />
            <Toggle checked={f.showTaxId} onChange={(v) => set({ showTaxId: v })} label="NIF" />
            <Toggle checked={f.showAddress} onChange={(v) => set({ showAddress: v })} label="Dirección del local" />
            <Toggle checked={f.showPhone} onChange={(v) => set({ showPhone: v })} label="Teléfono" />
            <Toggle checked={f.showTax} onChange={(v) => set({ showTax: v })} label="Cuadro de IVA" hint="Base, IVA y total, encima del total." />
          </div>
        </Card>

        <Card title="Mensaje al final" description="Lo que quieras decir a tus clientes: gracias, tu Instagram, la clave del wifi, el horario… Hasta 6 líneas.">
          <textarea
            value={f.footer}
            onChange={(e) => set({ footer: e.target.value.slice(0, FOOTER_MAX) })}
            rows={4}
            placeholder={"¡Gracias por venir!\nSíguenos en Instagram @tulocal\nWifi: tulocal · Clave: 12345678"}
            aria-label="Mensaje al final del ticket"
            className={`${input} resize-y`}
          />
          <p className="mt-1 text-right text-xs text-[var(--p-muted)]">
            {f.footer.length}/{FOOTER_MAX}
          </p>
        </Card>

        <Card title="QR a tu tienda online" description="Un código al pie para que el cliente pida desde el móvil la próxima vez, sin comisiones de plataformas.">
          <Toggle checked={f.qr} onChange={(v) => set({ qr: v })} label="Poner el QR en el ticket" />
        </Card>
      </div>

      {/* Vista previa en directo */}
      <div className="lg:sticky lg:top-6">
        <button type="button" onClick={() => setShowPreview((v) => !v)} aria-expanded={showPreview} className="p-press mb-2 flex min-h-11 w-full items-center justify-between rounded-2xl bg-[var(--p-surface)] px-4 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:hidden">
          Ver cómo queda el ticket
          <span className="text-[var(--p-muted)]">{showPreview ? "Ocultar" : "Ver"}</span>
        </button>
        <div className={showPreview ? "" : "hidden lg:block"}>
        <p className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--p-muted)]">
          <span>Vista previa</span>
          {loading && <span className="font-normal">Actualizando…</span>}
        </p>
        <div className="rounded-2xl bg-[var(--p-bg)] p-4">
          {preview.error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{preview.error}</p>}
          {preview.src ? (
            // eslint-disable-next-line @next/next/no-img-element -- PNG generado al momento
            <img src={preview.src} alt="Vista previa del ticket" className={`mx-auto block w-full max-w-[320px] rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] transition-opacity ${loading ? "opacity-60" : ""}`} />
          ) : (
            <div className="mx-auto h-96 w-full max-w-[320px] animate-pulse rounded-sm bg-white shadow-sm" />
          )}
          <p className="mt-2 text-center text-[11px] text-[var(--p-muted)]">Ticket de ejemplo. Así sale en la impresora, en blanco y negro.</p>
        </div>
        </div>
      </div>
    </div>
  );
}
