import type { CSSProperties } from "react";

// Las hojas de la tienda usan sus propias variables de color: aquí se mapean a las del panel.
export const STORE_VARS = {
  "--bg-base": "var(--p-bg)",
  "--surface-0": "var(--p-bg)",
  "--surface-1": "var(--p-surface)",
  "--border": "var(--p-line)",
  "--text-primary": "var(--p-ink)",
  "--text-secondary": "var(--p-muted)",
  "--brand-accent": "var(--p-brand)",
  "--on-accent": "#ffffff",
  "--brand-secondary": "var(--p-accent)",
  "--on-secondary": "#ffffff",
  "--font-body": "inherit",
  "--font-heading": "inherit",
  "--heading-case": "none",
  "--border-radius": "14px",
} as CSSProperties;
