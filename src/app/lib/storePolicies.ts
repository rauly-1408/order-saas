// Ajustes de Configuración que viven en Tenant.settings (sin tablas nuevas):
// pantalla de pago, impuestos y políticas propias. Sin dependencias de
// servidor: se usan también en el navegador. Ver docs/CONFIGURACION.md

export type CheckoutSettings = {
  notes: boolean; // campo «Notas» del pedido
  scheduling: boolean; // programar el pedido para más tarde
  marketingConsent: boolean; // casilla «Quiero recibir ofertas…»
  tips: { enabled: boolean; percents: number[] }; // propina en el checkout
};

export const DEFAULT_CHECKOUT: CheckoutSettings = { notes: true, scheduling: true, marketingConsent: true, tips: { enabled: false, percents: [5, 10, 15] } };

export function readCheckout(settings: unknown): CheckoutSettings {
  const c = ((settings ?? {}) as Record<string, unknown>).checkout as Record<string, unknown> | undefined;
  if (!c || typeof c !== "object") return DEFAULT_CHECKOUT;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const tips = (c.tips ?? {}) as Record<string, unknown>;
  const percents = Array.isArray(tips.percents)
    ? [...new Set(tips.percents.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 30))].sort((a, b) => a - b).slice(0, 4)
    : DEFAULT_CHECKOUT.tips.percents;
  return {
    notes: bool(c.notes, true),
    scheduling: bool(c.scheduling, true),
    marketingConsent: bool(c.marketingConsent, true),
    tips: { enabled: bool(tips.enabled, false) && percents.length > 0, percents: percents.length ? percents : DEFAULT_CHECKOUT.tips.percents },
  };
}

// Propina en céntimos sobre lo que paga el cliente por la comida (sin envío).
export function tipCents(foodCents: number, percent: number): number {
  return percent > 0 ? Math.round((Math.max(foodCents, 0) * percent) / 100) : 0;
}

// ─── Impuestos ─────────────────────────────────────────────────────────────
// En España la comida preparada lleva un 10 % de IVA y los precios de la carta
// ya lo incluyen. Se muestra el desglose en la confirmación y en los informes.
export type TaxSettings = { rate: number; showOnReceipt: boolean };
export const DEFAULT_TAX: TaxSettings = { rate: 10, showOnReceipt: true };
export const TAX_RATES = [4, 10, 21];

export function readTax(settings: unknown): TaxSettings {
  const t = ((settings ?? {}) as Record<string, unknown>).tax as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return DEFAULT_TAX;
  const rate = Number(t.rate);
  return { rate: TAX_RATES.includes(rate) ? rate : DEFAULT_TAX.rate, showOnReceipt: t.showOnReceipt !== false };
}

// IVA incluido en un importe con IVA.
export function includedTax(grossCents: number, rate: number): number {
  return grossCents - Math.round(grossCents / (1 + rate / 100));
}

// ─── Políticas ─────────────────────────────────────────────────────────────
// Texto propio de cada página legal (si está vacío, se usa el generado).
export function readPolicies(settings: unknown): Partial<Record<string, string>> {
  const p = ((settings ?? {}) as Record<string, unknown>).policies as Record<string, unknown> | undefined;
  if (!p || typeof p !== "object") return {};
  return Object.fromEntries(Object.entries(p).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, (v as string).slice(0, 20_000)]));
}

// Texto propio → secciones: «## Título» abre una sección; los párrafos van
// separados por una línea en blanco.
export function customPolicySections(text: string): { heading: string; paragraphs: string[] }[] {
  const out: { heading: string; paragraphs: string[] }[] = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.trim().split("\n");
    if (!lines[0]) continue;
    if (lines[0].startsWith("## ")) {
      out.push({ heading: lines[0].slice(3).trim(), paragraphs: lines.slice(1).join(" ").trim() ? [lines.slice(1).join(" ").trim()] : [] });
    } else {
      if (!out.length) out.push({ heading: "", paragraphs: [] });
      out[out.length - 1].paragraphs.push(lines.join(" ").trim());
    }
  }
  return out;
}
