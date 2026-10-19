// Identidad de marca (Panel → Configuración → Marca): imágenes, fuentes, paleta y
// presencia online. Funciones puras: las usan la API, la carta y el panel.
// Ver docs/PERSONALIZACION.md

// ── Imágenes ────────────────────────────────────────────────────────────
export type AssetKind = "FAVICON" | "LOGO" | "LOGO_MONO" | "LOGO_SQUARE" | "HERO";

export const ASSETS: Record<AssetKind, { slug: string; brandingKey: string; title: string; help: string; maxSide: number; keepAlpha: boolean }> = {
  FAVICON: { slug: "favicon", brandingKey: "faviconUrl", title: "Favicon", help: "El icono pequeño de la pestaña del navegador. Cuadrado.", maxSide: 128, keepAlpha: true },
  LOGO: { slug: "logo", brandingKey: "logoUrl", title: "Logotipo principal", help: "Se muestra en la cabecera de tu carta. PNG con fondo transparente, formato horizontal.", maxSide: 1200, keepAlpha: true },
  LOGO_MONO: { slug: "logo-mono", brandingKey: "logoMonoUrl", title: "Logotipo en blanco y negro", help: "Para imprimir tickets y recibos. PNG con fondo transparente.", maxSide: 1200, keepAlpha: true },
  LOGO_SQUARE: { slug: "logo-square", brandingKey: "logoSquareUrl", title: "Logotipo cuadrado", help: "Icono de la app del panel y perfiles (1:1). PNG o JPG con color de fondo.", maxSide: 512, keepAlpha: true },
  HERO: { slug: "hero", brandingKey: "heroImageUrl", title: "Imagen de cabecera", help: "Foto de portada de la carta. Horizontal; se recorta en móvil.", maxSide: 1800, keepAlpha: false },
};

export const ASSET_KINDS = Object.keys(ASSETS) as AssetKind[];
export const MAX_ASSET_BYTES = 1_500_000;
export const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;

export function assetKindFromSlug(slug: string): AssetKind | null {
  return ASSET_KINDS.find((k) => ASSETS[k].slug === slug) ?? null;
}

// Tipo real del archivo por sus primeros bytes (no nos fiamos de la cabecera).
export function sniffImage(bytes: Uint8Array): (typeof ALLOWED_MIME)[number] | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

// ── Fuentes ─────────────────────────────────────────────────────────────
// Inter y Anton ya vienen cargadas con next/font; el resto se piden a Google Fonts.
export type BrandFont = { name: string; css: string; google: string | null; kind: "texto" | "rótulo" | "elegante" };

export const BRAND_FONTS: BrandFont[] = [
  { name: "Inter", css: "var(--font-inter), -apple-system, BlinkMacSystemFont, system-ui, sans-serif", google: null, kind: "texto" },
  { name: "DM Sans", css: "'DM Sans', system-ui, sans-serif", google: "DM+Sans:wght@400;500;700", kind: "texto" },
  { name: "Poppins", css: "'Poppins', system-ui, sans-serif", google: "Poppins:wght@400;500;700", kind: "texto" },
  { name: "Montserrat", css: "'Montserrat', system-ui, sans-serif", google: "Montserrat:wght@400;600;800", kind: "texto" },
  { name: "Nunito", css: "'Nunito', system-ui, sans-serif", google: "Nunito:wght@400;600;800", kind: "texto" },
  { name: "Anton", css: "var(--font-display), Anton, Impact, sans-serif", google: null, kind: "rótulo" },
  { name: "Bebas Neue", css: "'Bebas Neue', Impact, sans-serif", google: "Bebas+Neue", kind: "rótulo" },
  { name: "Oswald", css: "'Oswald', Impact, sans-serif", google: "Oswald:wght@500;700", kind: "rótulo" },
  { name: "Archivo Black", css: "'Archivo Black', Impact, sans-serif", google: "Archivo+Black", kind: "rótulo" },
  { name: "Playfair Display", css: "'Playfair Display', Georgia, serif", google: "Playfair+Display:wght@600;800", kind: "elegante" },
  { name: "DM Serif Display", css: "'DM Serif Display', Georgia, serif", google: "DM+Serif+Display", kind: "elegante" },
  { name: "Lora", css: "'Lora', Georgia, serif", google: "Lora:wght@400;600;700", kind: "elegante" },
  { name: "Pacifico", css: "'Pacifico', cursive", google: "Pacifico", kind: "elegante" },
];

export function fontByName(name: unknown): BrandFont | null {
  return BRAND_FONTS.find((f) => f.name === name) ?? null;
}

// Enlace de Google Fonts para las fuentes elegidas (null si no hace falta).
export function googleFontsHref(names: (string | null | undefined)[]): string | null {
  const families = [...new Set(names)].map((n) => fontByName(n)?.google).filter((g): g is string => !!g);
  return families.length ? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap` : null;
}

// ── Paleta ──────────────────────────────────────────────────────────────
export const COLOR_KEYS = [
  "primaryColor", // acento: botones principales ("Añadir", "Pedir")
  "headingColor", // títulos de las secciones de la carta
  "headerColor", // barra superior
  "backgroundColor", // fondo
  "secondaryColor", // avisos y descuentos
  "surfaceColor", // tarjetas
  "textPrimary",
  "textSecondary",
  "borderColor",
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

// Contraste WCAG entre dos colores (1–21).
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ── Presencia online ────────────────────────────────────────────────────
export type OnlinePresence = {
  seoTitle: string | null;
  seoDescription: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  website: string | null;
  reviewsUrl: string | null; // reseñas de Google
};

export const SOCIAL_FIELDS: { key: keyof OnlinePresence; label: string; placeholder: string }[] = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/turestaurante" },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/turestaurante" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@turestaurante" },
  { key: "website", label: "Página web", placeholder: "https://turestaurante.com" },
  { key: "reviewsUrl", label: "Reseñas de Google", placeholder: "https://g.page/r/…/review" },
];

export function parseOnline(raw: unknown): OnlinePresence {
  const r = (raw ?? {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const url = (v: unknown) => {
    const s = text(v, 300);
    if (!s) return null;
    try {
      const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
    } catch {
      return null;
    }
  };
  return {
    seoTitle: text(r.seoTitle, 70),
    seoDescription: text(r.seoDescription, 160),
    instagram: url(r.instagram),
    facebook: url(r.facebook),
    tiktok: url(r.tiktok),
    website: url(r.website),
    reviewsUrl: url(r.reviewsUrl),
  };
}

// ── Validación de lo que guarda Personalización ─────────────────────────
export type BrandInput = {
  name: string;
  colors: Partial<Record<ColorKey, string | null>>;
  headingFontName: string;
  bodyFontName: string;
  headingCase: "normal" | "uppercase";
  borderRadius: string;
  menusPerRow: number;
  online: OnlinePresence;
};

export function parseBrand(body: unknown): BrandInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 60) return "El nombre de la marca es obligatorio (máx. 60 caracteres)";
  const rawColors = (b.colors ?? {}) as Record<string, unknown>;
  const colors: BrandInput["colors"] = {};
  for (const k of COLOR_KEYS) {
    const v = rawColors[k];
    if (v == null || v === "") colors[k] = null; // vacío = valor por defecto
    else if (isHex(v)) colors[k] = v.toLowerCase();
    else return `Color no válido: ${v}`;
  }
  if (!colors.primaryColor || !colors.backgroundColor) return "El color de acento y el de fondo son obligatorios";
  const heading = fontByName(b.headingFontName);
  const body_ = fontByName(b.bodyFontName);
  if (!heading || !body_) return "Fuente no válida";
  const radius = Number(b.borderRadius);
  if (!Number.isInteger(radius) || radius < 0 || radius > 28) return "Redondeo no válido";
  const perRow = Number(b.menusPerRow ?? 2);
  if (!Number.isInteger(perRow) || perRow < 2 || perRow > 5) return "Menús por fila no válido (2 a 5)";
  return {
    name,
    colors,
    headingFontName: heading.name,
    bodyFontName: body_.name,
    headingCase: b.headingCase === "uppercase" ? "uppercase" : "normal",
    borderRadius: `${radius}px`,
    menusPerRow: perRow,
    online: parseOnline(b.online),
  };
}

// Nombre de la fuente a partir del CSS guardado (para marcas anteriores a este formulario).
export function fontNameFromCss(css: unknown, fallback: string): string {
  if (typeof css !== "string") return fallback;
  if (css.includes("--font-display")) return "Anton";
  if (css.includes("--font-inter")) return "Inter";
  return BRAND_FONTS.find((f) => css.includes(`'${f.name}'`) || css.startsWith(f.name))?.name ?? fallback;
}
