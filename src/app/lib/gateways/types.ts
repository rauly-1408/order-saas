// Pasarelas de pago: como en Shopify, cada restaurante conecta la suya y el
// dinero le entra directamente. Ver docs/PAGOS.md

export const GATEWAYS = ["NONE", "TEST", "STRIPE", "REDSYS"] as const;
export type GatewayId = (typeof GATEWAYS)[number];

export const GATEWAY_LABEL: Record<GatewayId, string> = {
  NONE: "Sin pago online",
  TEST: "Modo prueba",
  STRIPE: "Stripe",
  REDSYS: "Redsys (TPV de tu banco)",
};

export type OnlineMethod = "CARD" | "BIZUM";

// Cómo se lleva al cliente a pagar: a una dirección o con un formulario (Redsys).
export type PaymentStart =
  | { kind: "redirect"; url: string; ref: string }
  | { kind: "form"; action: string; fields: Record<string, string>; ref: string };

export type PaymentOutcome = { status: "PAID" | "FAILED" | "PENDING"; ref?: string; message?: string };

export type GatewayContext = { tenantId: string; config: Record<string, unknown>; secrets: Record<string, string> };

export type PaymentOrder = {
  id: string;
  orderNumber: number | null;
  totalCents: number;
  paymentRef: string | null;
  tenantName: string;
  lang: "es" | "en";
};

// Direcciones a las que vuelve el cliente y a las que avisa la pasarela.
export type PaymentUrls = { returnUrl: string; cancelUrl: string; notifyUrl: string };

export interface Gateway {
  start(order: PaymentOrder, method: OnlineMethod, urls: PaymentUrls, ctx: GatewayContext): Promise<PaymentStart>;
  // Comprueba el pago con lo que trae la vuelta del cliente o el aviso.
  verify(order: PaymentOrder, params: Record<string, string>, ctx: GatewayContext): Promise<PaymentOutcome>;
  refund(order: PaymentOrder, ctx: GatewayContext): Promise<void>;
}

export class GatewayError extends Error {}
