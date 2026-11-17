// Sin dependencias de servidor: lo usan el panel (cliente) y las rutas de la API.
// Compra mínima para usar una tarjeta regalo (Configuración → Tarjetas regalo).
// Por defecto 10 €; 0 = sin mínimo. Cuenta la compra (productos con descuentos),
// sin envío ni propina.
export const GIFT_MIN_DEFAULT = 1000;
export function giftMinOrderCents(settings: unknown): number {
  const g = ((settings ?? {}) as Record<string, unknown>).giftCards as Record<string, unknown> | undefined;
  const v = Number(g?.minOrderCents);
  return Number.isInteger(v) && v >= 0 && v <= 100_000 ? v : GIFT_MIN_DEFAULT;
}
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";
export const giftMinMessage = (min: number) => `Para usar la tarjeta regalo, tu compra tiene que ser de al menos ${eur(min)}`;
