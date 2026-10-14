// Cálculo de la comisión de la plataforma en pagos online (Stripe Connect,
// direct charge: el restaurante es merchant of record y la plataforma cobra
// un application fee). Los pedidos "pagar en el local" no llevan comisión.

export const DEFAULT_PLATFORM_FEE_BPS = 300; // 3 %

// bps = puntos básicos (300 = 3 %). Redondeo al céntimo más cercano.
export function platformFeeCents(totalCents: number, feeBps: number): number {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return 0;
  const bps = Number.isFinite(feeBps) ? Math.min(Math.max(Math.trunc(feeBps), 0), 10_000) : DEFAULT_PLATFORM_FEE_BPS;
  return Math.round((totalCents * bps) / 10_000);
}
