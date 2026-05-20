/**
 * tenantConfig.ts
 *
 * CAPA TEMPORAL DE CONFIGURACIÓN POR TENANT
 * ==========================================
 * Esta capa existe porque el dashboard de gestión aún no está construido.
 * Permite que el front público /pedir/[tenant] funcione con configuración
 * visual y operativa real para cada tenant.
 *
 * CÓMO FUNCIONA:
 * - La API /api/menu/[tenant] devuelve tenant.branding y tenant.settings (Json)
 * - getTenantTheme() combina esos datos con los defaults del sistema
 * - El componente MenuClient recibe el theme como prop y aplica CSS vars
 *
 * MIGRACIÓN FUTURA (Sprint 5 - Dashboard):
 * - El dashboard permitirá editar estos valores desde UI
 * - Se guardarán en tenant.branding / tenant.settings en la DB
 * - Esta función seguirá siendo el adaptador entre DB y componentes
 * - Documentado en: docs/architecture/tenant-config.md
 */

// ─────────────────────────────────────────────
//  TIPOS
// ─────────────────────────────────────────────

export type TenantTheme = {
  // Colores
  primaryColor: string;      // Color principal de la marca (CTAs, accents)
  secondaryColor: string;    // Color secundario
  backgroundColor: string;  // Fondo base de la carta
  surfaceColor: string;      // Fondo de cards y paneles
  borderColor: string;       // Color de bordes
  textPrimary: string;       // Texto principal
  textSecondary: string;     // Texto secundario / subtítulos

  // Tipografía
  bodyFont: string;          // Fuente del cuerpo
  headingFont: string;       // Fuente de títulos

  // Visual
  borderRadius: string;      // Radio de bordes (e.g. "12px", "0px")
  cardStyle: 'rounded' | 'sharp' | 'pill'; // Estilo de cards

  // Identidad
  logoUrl: string | null;    // URL del logo
  faviconUrl: string | null; // URL del favicon
  heroImageUrl: string | null; // Imagen hero de la carta
};

export type StoreSettings = {
  deliveryEnabled: boolean;
  takeawayEnabled: boolean;
  minimumOrderCents: number;
  deliveryFeeCents: number;
  estimatedDeliveryMinutes: number;
  estimatedPickupMinutes: number;
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
//  DEFAULTS DEL SISTEMA
//  Usados como fallback cuando el tenant no
//  tiene configuración específica en la DB.
// ─────────────────────────────────────────────

export const SYSTEM_DEFAULT_THEME: TenantTheme = {
  primaryColor: '#e8a020',
  secondaryColor: '#f0b030',
  backgroundColor: '#0d0d0d',
  surfaceColor: '#1a1a1a',
  borderColor: '#2a2a2a',
  textPrimary: '#f0ece4',
  textSecondary: '#888888',
  bodyFont: 'Arial, Helvetica, sans-serif',
  headingFont: 'Arial, Helvetica, sans-serif',
  borderRadius: '14px',
  cardStyle: 'rounded',
  logoUrl: null,
  faviconUrl: null,
  heroImageUrl: null,
};

export const SYSTEM_DEFAULT_SETTINGS: StoreSettings = {
  deliveryEnabled: true,
  takeawayEnabled: true,
  minimumOrderCents: 0,
  deliveryFeeCents: 0,
  estimatedDeliveryMinutes: 45,
  estimatedPickupMinutes: 20,
  currency: 'EUR',
  phone: null,
  whatsapp: null,
  instagram: null,
  address: null,
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/**
 * Combina el branding del tenant (de la DB) con los defaults del sistema.
 * El tenant puede sobrescribir cualquier valor.
 */
export function getTenantTheme(brandingJson: Record<string, unknown> = {}): TenantTheme {
  return {
    ...SYSTEM_DEFAULT_THEME,
    ...(brandingJson as Partial<TenantTheme>),
  };
}

/**
 * Combina el settings del tenant (de la DB) con los defaults del sistema.
 */
export function getTenantSettings(settingsJson: Record<string, unknown> = {}): StoreSettings {
  return {
    ...SYSTEM_DEFAULT_SETTINGS,
    ...(settingsJson as Partial<StoreSettings>),
  };
}

/**
 * Convierte un TenantTheme a CSS custom properties.
 * Usado en layout.tsx o en el componente raíz de la carta.
 */
export function themeToCssVars(theme: TenantTheme): Record<string, string> {
  return {
    '--brand-primary': theme.primaryColor,
    '--brand-secondary': theme.secondaryColor,
    '--bg-base': theme.backgroundColor,
    '--surface-1': theme.surfaceColor,
    '--border': theme.borderColor,
    '--text-primary': theme.textPrimary,
    '--text-secondary': theme.textSecondary,
    '--font-body': theme.bodyFont,
    '--font-heading': theme.headingFont,
    '--radius': theme.borderRadius,
    // Aliases para compatibilidad con el design system actual
    '--brand-accent': theme.primaryColor,
    '--brand-accent-h': theme.secondaryColor,
    '--surface-0': '#111111',
    '--surface-2': '#252525',
  };
}
