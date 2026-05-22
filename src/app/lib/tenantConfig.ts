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

  // Tipografía
  bodyFont: string;
  headingFont: string;

  // Visual
  borderRadius: string;
  cardStyle: 'rounded' | 'sharp' | 'pill';

  // Identidad
  logoUrl: string | null;
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
  bodyFont:    'Inter, system-ui, sans-serif',
  headingFont: 'Inter, system-ui, sans-serif',
  borderRadius: '8px',
  cardStyle:    'rounded',
  logoUrl:      null,
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
          '--brand-secondary': theme.secondaryColor,
          '--font-body': theme.bodyFont,
          '--font-heading': theme.headingFont,
          '--border-radius': theme.borderRadius,
    };
}
