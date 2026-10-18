"use client";

import { useState } from "react";
import { toast, useSaveBar } from "../ui";
import { BUSINESS_FIELDS, LEGAL_DOCS, missingRequired, type BusinessInfo } from "@/app/lib/business";

// Datos del negocio: obligatorios en una tienda online (LSSI) y de contacto.
// Salen en el pie de la tienda y rellenan los textos legales.

const card = "rounded-2xl bg-[var(--p-surface)] p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";
const input = "w-full rounded-lg border border-[var(--p-line)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]";

export default function DatosNegocio({ tenant, initial, onSaved }: { tenant: string; initial: BusinessInfo; onSaved: (b: BusinessInfo) => void }) {
  const [form, setForm] = useState<BusinessInfo>(initial);
  const missing = missingRequired(form);

  // Barra «Cambios sin guardar» (como Shopify).
  useSaveBar("negocio", {
    dirty: JSON.stringify(form) !== JSON.stringify(initial),
    discard: () => setForm(initial),
    save: async () => {
      const res = await fetch(`/api/admin/${tenant}/business`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(json.error ?? "No se pudo guardar", false);
        return false;
      }
      setForm(json.business);
      onSaved(json.business);
      return true;
    },
  });

  return (
    <div className="space-y-4">
      {missing.length > 0 ? (
        <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">⚠️ Faltan datos obligatorios para vender online</p>
          <p className="mt-0.5 text-[13px]">La ley (LSSI) exige mostrarlos en la tienda: {missing.join(", ").toLowerCase()}.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">✓ Tienes todos los datos obligatorios. Salen en el pie de tu tienda y en los textos legales.</div>
      )}

      <section className={card}>
        <h3 className="text-[15px] font-semibold">Datos del negocio</h3>
        <p className="mt-0.5 text-xs text-[var(--p-muted)]">Se muestran en el pie de tu tienda: dirección (con enlace a Google Maps), teléfono, email y WhatsApp.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {BUSINESS_FIELDS.map((f) => (
            <div key={f.key} className={f.full ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-[13px] font-medium text-[var(--p-muted)]" htmlFor={`biz-${f.key}`}>
                {f.label}
                {f.required && <span className="text-[var(--p-accent)]"> *</span>}
              </label>
              <input
                id={`biz-${f.key}`}
                value={form[f.key] ?? ""}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value || null })}
                placeholder={f.placeholder}
                inputMode={f.key === "postalCode" ? "numeric" : f.key === "phone" || f.key === "whatsapp" ? "tel" : f.key === "email" ? "email" : undefined}
                className={input}
              />
              {f.hint && <p className="mt-1 text-[11px] text-[var(--p-muted)]">{f.hint}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className={card}>
        <h3 className="text-[15px] font-semibold">Textos legales de tu tienda</h3>
        <p className="mt-0.5 text-xs text-[var(--p-muted)]">
          Se generan solos con estos datos y salen enlazados en el pie. Son una plantilla para que no te falte nada: revísalos con tu asesor antes de abrir al público.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEGAL_DOCS.map((d) => (
            <a key={d.slug} href={`/pedir/${tenant}/legal/${d.slug}`} target="_blank" className="p-press rounded-full border border-[var(--p-line)] px-3.5 py-1.5 text-sm font-medium text-[var(--p-ink)] no-underline hover:bg-black/[0.04]">
              {d.title} ↗
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
