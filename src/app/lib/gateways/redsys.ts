// Redsys: el TPV virtual que da cualquier banco español (con Bizum).
// Redirección por formulario firmado (HMAC_SHA256_V1). La firma usa una clave
// derivada por pedido: 3DES-CBC del número de pedido con la clave del comercio.
// Redsys avisa a DS_MERCHANT_MERCHANTURL y además devuelve los parámetros
// firmados al volver el cliente, así que se puede confirmar en los dos sitios.
import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { GatewayError, type Gateway, type GatewayContext } from "./types";

export type RedsysConfig = { merchantCode: string; terminal: string; env: "test" | "live" };

const HOST: Record<RedsysConfig["env"], string> = {
  test: "https://sis-t.redsys.es:25443/sis",
  live: "https://sis.redsys.es/sis",
};

export function redsysConfig(raw: Record<string, unknown>): RedsysConfig {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  return { merchantCode: s("merchantCode").replace(/\D/g, "").slice(0, 9), terminal: s("terminal").replace(/\D/g, "").slice(0, 3) || "1", env: raw.env === "live" ? "live" : "test" };
}

export function redsysProblem(config: RedsysConfig, secretKey: string | undefined): string | null {
  if (!/^\d{9}$/.test(config.merchantCode)) return "El código de comercio (FUC) tiene 9 cifras";
  if (!secretKey) return "Falta la clave secreta del comercio";
  if (Buffer.from(secretKey, "base64").length !== 24) return "La clave secreta no tiene el formato de Redsys (32 caracteres)";
  return null;
}

const toB64url = (s: string) => s.replace(/\+/g, "-").replace(/\//g, "_");

function orderKey(secretKey: string, dsOrder: string): Buffer {
  const key = Buffer.from(secretKey, "base64");
  const data = Buffer.alloc(Math.ceil(dsOrder.length / 8) * 8, 0);
  data.write(dsOrder, "utf8");
  const cipher = createCipheriv("des-ede3-cbc", key, Buffer.alloc(8, 0));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function redsysSign(secretKey: string, dsOrder: string, merchantParameters: string): string {
  return createHmac("sha256", orderKey(secretKey, dsOrder)).update(merchantParameters).digest("base64");
}

// Decodifica y comprueba la firma de lo que manda Redsys (aviso o vuelta).
export function redsysVerify(secretKey: string, params: Record<string, string>): Record<string, string> | null {
  const mp = params.Ds_MerchantParameters;
  const sig = params.Ds_Signature;
  if (!mp || !sig) return null;
  let data: Record<string, string>;
  try {
    data = JSON.parse(Buffer.from(mp.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, string>;
  } catch {
    return null;
  }
  const dsOrder = data.Ds_Order ?? data.DS_ORDER;
  if (!dsOrder) return null;
  const expected = Buffer.from(toB64url(redsysSign(secretKey, dsOrder, mp)));
  const given = Buffer.from(toB64url(sig));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return data;
}

// Número de pedido para Redsys: 4 cifras + hasta 8 caracteres, distinto en cada intento.
export function redsysOrderId(orderNumber: number | null): string {
  const head = String((orderNumber ?? 0) % 10_000).padStart(4, "0");
  return head + randomBytes(6).toString("hex").slice(0, 8);
}

function setup(ctx: GatewayContext) {
  const config = redsysConfig(ctx.config);
  const secretKey = ctx.secrets.secretKey;
  const problem = redsysProblem(config, secretKey);
  if (problem) throw new GatewayError(problem);
  return { config, secretKey: secretKey! };
}

const encode = (o: Record<string, string>) => Buffer.from(JSON.stringify(o)).toString("base64");

export const redsysGateway: Gateway = {
  async start(order, method, urls, ctx) {
    const { config, secretKey } = setup(ctx);
    const dsOrder = redsysOrderId(order.orderNumber);
    const params = encode({
      DS_MERCHANT_AMOUNT: String(order.totalCents),
      DS_MERCHANT_ORDER: dsOrder,
      DS_MERCHANT_MERCHANTCODE: config.merchantCode,
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_TRANSACTIONTYPE: "0",
      DS_MERCHANT_TERMINAL: config.terminal,
      DS_MERCHANT_MERCHANTURL: urls.notifyUrl,
      DS_MERCHANT_URLOK: urls.returnUrl,
      DS_MERCHANT_URLKO: urls.returnUrl,
      DS_MERCHANT_MERCHANTNAME: order.tenantName.slice(0, 25),
      DS_MERCHANT_PRODUCTDESCRIPTION: `Pedido ${order.orderNumber ? `#${order.orderNumber}` : ""}`.trim().slice(0, 125),
      DS_MERCHANT_CONSUMERLANGUAGE: order.lang === "en" ? "002" : "001",
      ...(method === "BIZUM" && { DS_MERCHANT_PAYMETHODS: "z" }),
    });
    return {
      kind: "form",
      action: `${HOST[config.env]}/realizarPago`,
      fields: { Ds_SignatureVersion: "HMAC_SHA256_V1", Ds_MerchantParameters: params, Ds_Signature: redsysSign(secretKey, dsOrder, params) },
      ref: dsOrder,
    };
  },

  async verify(order, params, ctx) {
    const { secretKey } = setup(ctx);
    const data = redsysVerify(secretKey, params);
    if (!data) return { status: "PENDING" };
    // El pedido de Redsys tiene que ser el último intento de este pedido y por el mismo importe.
    if ((data.Ds_Order ?? data.DS_ORDER) !== order.paymentRef || Number(data.Ds_Amount) !== order.totalCents) return { status: "PENDING" };
    const code = Number(data.Ds_Response);
    if (Number.isInteger(code) && code >= 0 && code <= 99) return { status: "PAID", ref: order.paymentRef ?? undefined };
    return { status: "FAILED", message: "El banco ha rechazado el pago" };
  },

  async refund(order, ctx) {
    const { config, secretKey } = setup(ctx);
    if (!order.paymentRef) throw new GatewayError("Pedido sin referencia de pago");
    const params = encode({
      DS_MERCHANT_AMOUNT: String(order.totalCents),
      DS_MERCHANT_ORDER: order.paymentRef,
      DS_MERCHANT_MERCHANTCODE: config.merchantCode,
      DS_MERCHANT_CURRENCY: "978",
      DS_MERCHANT_TRANSACTIONTYPE: "3", // devolución
      DS_MERCHANT_TERMINAL: config.terminal,
    });
    const res = await fetch(`${HOST[config.env]}/rest/trataPeticionREST`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Ds_SignatureVersion: "HMAC_SHA256_V1", Ds_MerchantParameters: params, Ds_Signature: redsysSign(secretKey, order.paymentRef, params) }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, string>;
    const data = json.Ds_MerchantParameters ? redsysVerify(secretKey, json) : null;
    if (!data || data.Ds_Response !== "0900") throw new GatewayError(`Redsys no ha aceptado la devolución${json.errorCode ? ` (${json.errorCode})` : ""}`);
  },
};
