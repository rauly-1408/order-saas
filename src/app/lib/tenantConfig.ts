/**
 * tenantConfig.ts
 *
 * CAPA DE ADAPTACIÓN TENANT → COMPONENTES
 * =========================================
 * Convierte el JSON Tenant.branding / Tenant.settings (DB) en tipos
 * fuertemente tipados que consumen los componentes.
 *
 * ⚠️  TRANSICIÓN ACTIVA:
 *   - Actualmente los datos viven en Tenant.branding (JSON) y Tenant.settings (JSON).
 *   - En Sprint 5 se migrarán a tablas TenantTheme y StoreSettings.
 *   - Este archivo seguirá siendo el adaptador entre DB y componentes,
 *     pero leerá de relaciones en lugar de JSON.
 *   Ver: docs/architecture/tenant-config.md
 *
 * ❌ REGLAS ABSOLUTAS:
 *   - NO hardcodear colores, textos ni datos de ningún tenant (incluido Estafetén).
 *   - SYSTEM_DEFAULT_* son los valores del sistema, no de ningún restaurante.
 *   - Todos los componentes consumen estos tipos vía props o contexto.
 */

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

export type TenantTheme = {
  // Colores
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  surfaceColor: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  /** Títulos de sección de la carta (null = color de acento). */
  headingColor: string | null;
  /** Barra superior de la carta (null = color de tarjetas, translúcida). */
  headerColor: string | null;

  // Tipografía
  bodyFont: string;
  headingFont: string;
  /** Títulos en mayúsculas (útil con fuentes de rótulo condensadas como Anton). */
  headingCase: 'normal' | 'uppercase';

  // Visual
  borderRadius: string;
  cardStyle: 'rounded' | 'sharp' | 'pill';
  /** Menús (combos) visibles a la vez en ordenador (2–5); con más, carrusel. En el móvil siempre 2. */
  menusPerRow: number;

  // Identidad
  logoUrl: string | null;
  logoMonoUrl: string | null;
  logoSquareUrl: string | null;
  faviconUrl: string | null;
  heroImageUrl: string | null;
};

export type StoreSettings = {
  // Canales
  deliveryEnabled: boolean;
  takeawayEnabled: boolean;

  // Costes
  minimumOrderCents: number;
  deliveryFeeCents: number;

  // Tiempos
  estimatedDeliveryMinutes: number;
  estimatedPickupMinutes: number;

  // Contacto
  currency: string;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  address: string | null;
};

export type TenantConfig = {
  theme: TenantTheme;
  settings: StoreSettings;
};

// ─────────────────────────────────────────────
// DEFAULTS DEL SISTEMA
// Valores neutros — NO específicos de ningún tenant.
// Solo se usan como fallback cuando la DB no tiene un valor.
// ─────────────────────────────────────────────

export const SYSTEM_DEFAULT_THEME: TenantTheme = {
  primaryColor:    '#7939fe',
  secondaryColor:  '#9c6dfe',
  backgroundColor: '#ffffff',
  surfaceColor:    '#f7f7fb',
  borderColor:     '#eaeaf4',
  textPrimary:     '#393659',
  textSecondary:   '#b8b6df',
  headingColor:    null,
  headerColor:     null,
  bodyFont:    'Inter, system-ui, sans-serif',
  headingFont: 'Inter, system-ui, sans-serif',
  headingCase: 'normal',
  borderRadius: '8px',
  cardStyle:    'rounded',
  menusPerRow:  2,
  logoUrl:      null,
  logoMonoUrl:  null,
  logoSquareUrl: null,
  faviconUrl:   null,
  heroImageUrl: null,
};

export const SYSTEM_DEFAULT_SETTINGS: StoreSettings = {
  deliveryEnabled:           true,
  takeawayEnabled:           true,
  minimumOrderCents:         0,
  deliveryFeeCents:          0,
  estimatedDeliveryMinutes:  45,
  estimatedPickupMinutes:    20,
  currency:  'EUR',
  phone:     null,
  whatsapp:  null,
  instagram: null,
  address:   null,
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Combina el branding JSON del tenant con los defaults del sistema.
 * El tenant sobreescribe cualquier campo que tenga definido.
 * TEMP: cuando exista tabla TenantTheme, leer de relación en lugar de JSON.
 */
export function getTenantTheme(
  brandingJson: Record<string, unknown> = {}
): TenantTheme {
  return { ...SYSTEM_DEFAULT_THEME, ...(brandingJson as Partial<TenantTheme>) };
}

/**
 * Combina el settings JSON del tenant con los defaults del sistema.
 * TEMP: cuando exista tabla StoreSettings, leer de relación.
 */
export function getTenantSettings(
  settingsJson: Record<string, unknown> = {}
): StoreSettings {
  return { ...SYSTEM_DEFAULT_SETTINGS, ...(settingsJson as Partial<StoreSettings>) };
}


/**
 * Color de texto legible sobre un fondo dado: oscuro sobre colores claros
 * (ámbar, crema) y blanco sobre colores oscuros (verde, rojo intenso).
 */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contraste con blanco vs. con casi negro: gana el mayor.
  return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.0559) ? '#ffffff' : '#111111';
}

/**
 * Convierte un TenantTheme en un objeto de variables CSS inline.
 * Usado para aplicar el tema del tenant mediante style props en React.
 */
export function themeToCssVars(theme: TenantTheme): Record<string, string> {
    return {
          '--bg-base': theme.backgroundColor,
          '--surface-0': theme.surfaceColor,
          '--surface-1': theme.surfaceColor,
          '--border': theme.borderColor,
          '--text-primary': theme.textPrimary,
          '--text-secondary': theme.textSecondary,
          '--brand-accent': theme.primaryColor,
          '--on-accent': readableOn(theme.primaryColor),
          '--brand-secondary': theme.secondaryColor,
          '--on-secondary': readableOn(theme.secondaryColor),
          '--heading-color': theme.headingColor ?? theme.primaryColor,
          '--header-bg': theme.headerColor ?? theme.surfaceColor,
          '--on-header': theme.headerColor ? readableOn(theme.headerColor) : theme.textPrimary,
          '--font-body': theme.bodyFont,
          '--font-heading': theme.headingFont,
          '--heading-case': theme.headingCase === 'uppercase' ? 'uppercase' : 'none',
          '--border-radius': theme.borderRadius,
    };
}
