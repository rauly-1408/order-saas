import type { Metadata } from "next";

// Icono de la pestaña de cada restaurante: el favicon oficial que sube en
// Configuración → Marca. Si no tiene, se queda el de NorApp (layout raíz).
// Ver docs/MARCA-NORAPP.md
export const NORAPP_ICON = "/norapp-icon.svg";

export function tenantFavicon(branding: unknown): string | null {
  const url = (branding as Record<string, unknown> | null)?.faviconUrl;
  return typeof url === "string" && url ? url : null;
}

export function tenantIcons(branding: unknown, apple?: string): Metadata["icons"] | undefined {
  const fav = tenantFavicon(branding);
  if (!fav && !apple) return undefined;
  return { icon: fav ?? NORAPP_ICON, apple: apple ?? fav ?? undefined };
}
