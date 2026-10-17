// Stripe con la cuenta del propio restaurante (su clave secreta). El cliente
// paga en la página de Stripe (Checkout: tarjeta, Apple Pay, Google Pay) y
// vuelve a la tienda. Se confirma consultando la sesión; el webhook es un
// refuerzo por si el cliente cierra el navegador antes de volver.
import { createHmac, timingSafeEqual } from "node:crypto";
import { GatewayError, type Gateway, type GatewayContext } from "./types";

const API = "https://api.stripe.com/v1";

function secretKey(ctx: GatewayContext): string {
  const key = ctx.secrets.secretKey ?? "";
  if (!/^(sk|rk)_(test|live)_/.test(key)) throw new GatewayError("Falta la clave secreta de Stripe");
  return key;
}

export const stripeMode = (key: string | undefined) => (key?.includes("_live_") ? "live" : key?.includes("_test_") ? "test" : null);

async function call(ctx: GatewayContext, method: "GET" | "POST", path: string, form?: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${secretKey(ctx)}`, ...(form && { "Content-Type": "application/x-www-form-urlencoded" }) },
    body: form ? new URLSearchParams(form) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.error as { message?: string } | undefined)?.message ?? `error ${res.status}`;
    throw new GatewayError(`Stripe: ${msg}`);
  }
  return json;
}

// Comprueba la clave (Configuración → Pagos → Probar conexión).
export async function stripeCheck(ctx: GatewayContext): Promise<void> {
  await call(ctx, "GET", "/balance");
}

export const stripeGateway: Gateway = {
  async start(order, _method, urls, ctx) {
    const label = order.orderNumber ? `#${order.orderNumber}` : "";
    const session = await call(ctx, "POST", "/checkout/sessions", {
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "eur",
      "line_items[0][price_data][unit_amount]": String(order.totalCents),
      "line_items[0][price_data][product_data][name]": `${order.lang === "en" ? "Order" : "Pedido"} ${label} · ${order.tenantName}`.trim(),
      client_reference_id: order.id,
      "metadata[orderId]": order.id,
      "payment_intent_data[metadata][orderId]": order.id,
      locale: order.lang,
      success_url: `${urls.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: urls.cancelUrl,
      expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60), // Stripe pide 30 min como mínimo
    });
    if (typeof session.url !== "string" || typeof session.id !== "string") throw new GatewayError("Stripe no ha devuelto la página de pago");
    return { kind: "redirect", url: session.url, ref: session.id };
  },

  async verify(order, _params, ctx) {
    // Se consulta siempre la sesión guardada en el pedido, nunca la que trae la URL.
    if (!order.paymentRef) return { status: "PENDING" };
    const s = await call(ctx, "GET", `/checkout/sessions/${encodeURIComponent(order.paymentRef)}`);
    if (s.metadata && (s.metadata as Record<string, string>).orderId !== order.id) return { status: "PENDING" };
    if (s.payment_status === "paid" && s.amount_total === order.totalCents) {
      return { status: "PAID", ref: typeof s.payment_intent === "string" ? s.payment_intent : order.paymentRef };
    }
    if (s.status === "expired") return { status: "FAILED", message: "El pago ha caducado" };
    return { status: "PENDING" };
  },

  async refund(order, ctx) {
    if (!order.paymentRef) throw new GatewayError("Pedido sin referencia de pago");
    const field = order.paymentRef.startsWith("pi_") ? "payment_intent" : "charge";
    await call(ctx, "POST", "/refunds", { [field]: order.paymentRef });
  },
};

// Firma de los avisos de Stripe: cabecera Stripe-Signature «t=…,v1=…»,
// HMAC-SHA256 de «t.cuerpo» con el secreto del webhook. Tolerancia de 5 min.
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string | undefined, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .some((p) => {
      const given = Buffer.from(p.slice(3), "hex");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
