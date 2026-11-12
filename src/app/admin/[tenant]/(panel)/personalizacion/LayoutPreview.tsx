"use client";

import type { CSSProperties } from "react";
import { themeToCssVars, type TenantTheme } from "@/app/lib/tenantConfig";

// Vistas previas en vivo de «Redondeo de las tarjetas» y «Menús por fila»,
// con los colores de la marca que se está editando. Sin color-mix (Safari antiguo).

const MENUS = [
  { n: "Menú Íbero", p: "12,50 €", e: "🥪" },
  { n: "Menú Infantil", p: "8,90 €", e: "🧃" },
  { n: "Menú Pareja", p: "21,00 €", e: "🍟" },
  { n: "Menú Dulce", p: "6,50 €", e: "🍰" },
  { n: "Menú Familiar", p: "34,00 €", e: "🍗" },
  { n: "Menú Vegetal", p: "11,00 €", e: "🥗" },
];

function Frame({ theme, children }: { theme: TenantTheme; children: React.ReactNode }) {
  return (
    <div style={themeToCssVars(theme) as CSSProperties} className="mt-4 rounded-2xl border border-[var(--p-line)] bg-[var(--bg-base)] p-3 font-[family-name:var(--font-body)] text-[var(--text-primary)]">
      <p className="mb-2 text-[11px] font-medium text-[var(--text-secondary)]">Vista previa</p>
      {children}
    </div>
  );
}

function MenuCard({ m }: { m: (typeof MENUS)[number] }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[var(--border-radius)] bg-[var(--surface-0)]">
      <div className="flex aspect-[4/3] items-center justify-center bg-[var(--brand-accent)] text-3xl">{m.e}</div>
      <div className="p-2">
        <p className="truncate text-[12px] font-semibold">{m.n}</p>
        <p className="text-[11px] text-[var(--text-secondary)]">{m.p}</p>
      </div>
    </div>
  );
}

export function RadiusPreview({ theme }: { theme: TenantTheme }) {
  return (
    <Frame theme={theme}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_2fr]">
        <MenuCard m={MENUS[0]} />
        <MenuCard m={MENUS[1]} />
        <div className="col-span-2 flex items-center gap-3 self-start rounded-[var(--border-radius)] bg-[var(--surface-0)] p-2.5 sm:col-span-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">Íbero</p>
            <p className="truncate text-[11px] text-[var(--text-secondary)]">Jamón ibérico, tomate y aceite</p>
            <p className="mt-0.5 text-[12px] font-semibold">8,95 €</p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--brand-accent)] px-3 py-1 text-[11px] font-semibold text-[var(--on-accent)]">Añadir</span>
        </div>
      </div>
    </Frame>
  );
}

export function MenusRowPreview({ theme, perRow }: { theme: TenantTheme; perRow: number }) {
  const cols = ["", "", "grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5"][perRow] ?? "grid-cols-2";
  return (
    <Frame theme={theme}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--heading-color)]" style={{ fontFamily: "var(--font-heading)" }}>Menús</p>
        <div aria-hidden className="flex gap-1">
          {["‹", "›"].map((a) => (
            <span key={a} className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-0)] text-sm font-bold">{a}</span>
          ))}
        </div>
      </div>
      <div className={`mt-2 grid gap-2 ${cols}`}>
        {MENUS.slice(0, perRow).map((m) => (
          <MenuCard key={m.n} m={m} />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-[var(--text-secondary)]">En ordenador se ven {perRow} a la vez; el resto, con las flechas.</p>
    </Frame>
  );
}
