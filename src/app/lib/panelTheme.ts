// Tema visual del panel de administración: base neutra inspirada en Apple
// (mucho aire, grises suaves, tipografía del sistema) + la identidad de cada
// restaurante (color principal, acento y tono cálido). Se expone como variables
// CSS --p-* que usan todas las pantallas del panel.
import type { CSSProperties } from "react";

export type PanelBrand = {
  brand: string; // color principal (botones, activo, cifras destacadas)
  accent: string; // urgente: pedidos nuevos, alertas
  warm: string; // tono cálido para bloques destacados
};

const DEFAULT_BRAND: PanelBrand = { brand: "#1d1d1f", accent: "#e2382b", warm: "#f5f5f7" };

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

// branding.panel = { brand, accent, warm } (opcional). Si no existe, se usa el
// color principal de la carta para no dejar a ningún restaurante sin marca.
export function panelBrand(branding: unknown): PanelBrand {
  const b = (branding ?? {}) as Record<string, unknown>;
  const panel = (b.panel ?? {}) as Record<string, unknown>;
  return {
    brand: isHex(panel.brand) ? panel.brand : isHex(b.primaryColor) ? b.primaryColor : DEFAULT_BRAND.brand,
    accent: isHex(panel.accent) ? panel.accent : DEFAULT_BRAND.accent,
    warm: isHex(panel.warm) ? panel.warm : DEFAULT_BRAND.warm,
  };
}

// Mezcla dos colores hex (t = 0 → a, t = 1 → b).
function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export function panelCssVars(brand: PanelBrand): CSSProperties {
  return {
    "--p-bg": "#f5f5f7",
    "--p-surface": "#ffffff",
    "--p-ink": "#1d1d1f",
    "--p-muted": "#6e6e73",
    "--p-faint": "#a1a1a6",
    "--p-line": "rgba(0, 0, 0, 0.08)",
    "--p-brand": brand.brand,
    "--p-brand-strong": mix(brand.brand, "#000000", 0.25),
    "--p-brand-soft": mix(brand.brand, "#ffffff", 0.88),
    "--p-accent": brand.accent,
    "--p-accent-soft": mix(brand.accent, "#ffffff", 0.9),
    "--p-warm": brand.warm,
  } as CSSProperties;
}
