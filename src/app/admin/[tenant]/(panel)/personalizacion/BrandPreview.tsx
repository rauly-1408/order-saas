"use client";

import type { CSSProperties } from "react";
import { themeToCssVars, type TenantTheme } from "@/app/lib/tenantConfig";

// Vista previa en vivo de la carta con la marca que se está editando: barra
// superior, portada, título de sección y dos productos con su botón.
export default function BrandPreview({ theme, name }: { theme: TenantTheme; name: string }) {
  const vars = themeToCssVars(theme) as CSSProperties;
  const heading: CSSProperties = { fontFamily: "var(--font-heading)", textTransform: theme.headingCase === "uppercase" ? "uppercase" : "none" };
  const products = [
    { n: "Íbero", d: "Jamón ibérico, tomate y aceite", p: "8,95 €" },
    { n: "Pionono", d: "El dulce de Santa Fe", p: "2,50 €" },
  ];
  return (
    <div style={vars} className="overflow-hidden rounded-2xl border border-[var(--p-line)] bg-[var(--bg-base)] font-[family-name:var(--font-body)] text-[var(--text-primary)]">
      <div className="flex h-12 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--header-bg)] px-3">
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={theme.logoUrl} alt={name} className="h-7 w-auto max-w-[120px] object-contain" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-accent)] text-[11px] font-bold text-[var(--on-accent)]">{name.slice(0, 2).toUpperCase()}</span>
        )}
        {!theme.logoUrl && <span className="min-w-0 truncate text-sm font-semibold text-[var(--on-header)]">{name || "Tu restaurante"}</span>}
        <span className="ml-auto shrink-0 text-[10px] text-[var(--on-header)] opacity-70">Delivery y recogida</span>
      </div>
      <div className="p-3">
        <div
          className="rounded-[var(--border-radius)] px-4 py-5"
          style={
            theme.heroImageUrl
              ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url("${theme.heroImageUrl}")`, backgroundSize: "cover", backgroundPosition: "center", color: "#fff" }
              : { backgroundColor: "var(--brand-accent)", color: "var(--on-accent)" }
          }
        >
          <p className="text-[10px] opacity-75">Delivery y recogida</p>
          <p className="text-2xl leading-none" style={heading}>
            {name || "Tu restaurante"}
          </p>
        </div>
        <p className="mt-4 mb-2 text-lg leading-none text-[var(--heading-color)]" style={heading}>
          Molletes
        </p>
        <div className="space-y-2">
          {products.map((p) => (
            <div key={p.n} className="flex items-center gap-3 rounded-[var(--border-radius)] bg-[var(--surface-0)] p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{p.n}</p>
                <p className="truncate text-[11px] text-[var(--text-secondary)]">{p.d}</p>
                <p className="mt-0.5 text-[12px] font-semibold">{p.p}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--brand-accent)] px-3 py-1 text-[11px] font-semibold text-[var(--on-accent)]">Añadir</span>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-[var(--surface-0)] px-2.5 py-2 text-[11px] font-semibold text-[var(--brand-secondary)]">🏷️ Envío gratis desde 25 €</p>
      </div>
    </div>
  );
}
