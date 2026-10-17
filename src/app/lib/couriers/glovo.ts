// Glovo On-Demand (plataforma On Demand Rider de Delivery Hero).
// Docs: https://on-demand-rider-docs.deliveryhero.io/
// - Acceso: token OAuth2 con un JWT firmado (RS256) con la clave privada del
//   restaurante. Glovo da ClientID, KeyID y Scope; el restaurante les envía la
//   clave pública que genera el panel.
// - Avisos: Glovo llama a /api/webhooks/couriers/glovo/[tenant] con cada cambio,
//   firmado con HMAC-SHA256 (cabecera X-Signature-SHA256).
import { createHmac, createSign, generateKeyPairSync, randomUUID, timingSafeEqual } from "node:crypto";
import { CourierError, type AccountContext, type CourierPatch, type CourierProvider, type CourierStatus, type CourierUpdate } from "./types";

export type GlovoConfig = { clientId: string; keyId: string; scope: string; env: "stage" | "prod" };

const API: Record<GlovoConfig["env"], string> = {
  prod: "https://ondemand-api-glovoapp.deliveryhero.io/es/api/v1",
  stage: "https://api-infra-eu-central-1.stg.ondemandrider.net/es/api/v1",
};
const STS: Record<GlovoConfig["env"], string> = {
  prod: "https://sts.deliveryhero.io/oauth2/token",
  stage: "https://sts-st.deliveryhero.io/oauth2/token",
};
const AUDIENCE = "https://sts.deliveryhero.io";

export function glovoConfig(raw: Record<string, unknown>): GlovoConfig {
  const s = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim().slice(0, 200) : "");
  return { clientId: s("clientId"), keyId: s("keyId"), scope: s("scope"), env: raw.env === "prod" ? "prod" : "stage" };
}

export function missingGlovoSetup(config: GlovoConfig, secrets: Record<string, string>): string[] {
  const out: string[] = [];
  if (!config.clientId) out.push("Client ID");
  if (!config.keyId) out.push("Key ID");
  if (!config.scope) out.push("Scope");
  if (!secrets.privateKeyPem) out.push("claves generadas");
  return out;
}

// Par de claves RSA: la privada se guarda cifrada; la pública se envía a Glovo.
export function generateGlovoKeys(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

function clientAssertion(config: GlovoConfig, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: config.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.clientId, sub: config.clientId, aud: AUDIENCE, exp: now + 300, jti: randomUUID() }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${b64url(signer.sign(privateKeyPem))}`;
}

// Tokens en memoria por restaurante (duran 1 h; se renuevan 5 min antes).
const tokens = new Map<string, { token: string; until: number }>();

export async function glovoToken(account: AccountContext): Promise<string> {
  const config = glovoConfig(account.config);
  const missing = missingGlovoSetup(config, account.secrets);
  if (missing.length) throw new CourierError(`Faltan datos de Glovo: ${missing.join(", ")}`);
  const cacheKey = `${account.tenantId}:${config.env}:${config.clientId}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion(config, account.secrets.privateKeyPem),
    scope: config.scope,
  });
  const res = await fetch(STS[config.env], { method: "POST", body, signal: AbortSignal.timeout(10_000) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number | string };
  if (!res.ok || !json.access_token) throw new CourierError(`Glovo no ha aceptado las credenciales (${res.status}). Revisa Client ID, Key ID, Scope y que Glovo tenga tu clave pública.`);
  tokens.set(cacheKey, { token: json.access_token, until: Date.now() + (Number(json.expires_in) || 3600) * 1000 - 300_000 });
  return json.access_token;
}

async function call(account: AccountContext, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const config = glovoConfig(account.config);
  const token = await glovoToken(account);
  const res = await fetch(`${API[config.env]}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof json.message === "string" ? json.message : `error ${res.status}`;
    throw new CourierError(`Glovo: ${msg}`);
  }
  return json;
}

// Teléfono con prefijo internacional, como pide Glovo (+34…).
export function e164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return /^\d{9}$/.test(digits) ? `+34${digits}` : null;
}

export const GLOVO_STATUS: Record<string, CourierStatus | null> = {
  NEW: "REQUESTED",
  RECEIVED: "REQUESTED",
  WAITING_FOR_TRANSPORT: "REQUESTED",
  ASSIGNED_TO_TRANSPORT: "ASSIGNED",
  COURIER_ACCEPTED_DELIVERY: "ASSIGNED",
  NEAR_VENDOR: "AT_PICKUP",
  PICKED_UP: "PICKED_UP",
  COURIER_LEFT_VENDOR: "PICKED_UP",
  NEAR_CUSTOMER: "NEAR_CUSTOMER",
  DELIVERED: "DELIVERED",
  DELAYED: null, // retraso: se mantiene el estado y se actualizan las horas
  CANCELLED: "CANCELLED",
  RETURNED_TO_VENDOR: "CANCELLED",
};

const time = (v: unknown): Date | null => {
  if (typeof v === "number") return new Date(v < 1e12 ? v * 1000 : v);
  if (typeof v === "string" && v) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// Respuesta o aviso de Glovo → actualización común. status null = sin cambio de estado.
export function fromGlovo(o: Record<string, unknown>): CourierPatch {
  const raw = typeof o.status === "string" ? o.status : "";
  const timeline = (o.timeline ?? {}) as Record<string, unknown>;
  const driver = (o.driver ?? {}) as Record<string, unknown>;
  const fee = typeof o.delivery_fee === "number" ? Math.round(o.delivery_fee * 100) : undefined;
  return {
    externalId: typeof o.order_id === "string" ? o.order_id : undefined,
    status: raw in GLOVO_STATUS ? GLOVO_STATUS[raw] : null,
    rawStatus: raw || null,
    ...(fee !== undefined && { feeCents: fee }),
    ...(typeof o.tracking_link === "string" && { trackingUrl: o.tracking_link }),
    ...(typeof driver.name === "string" && { courierName: driver.name }),
    ...(typeof driver.phone_number === "string" && { courierPhone: driver.phone_number }),
    pickupEta: time(timeline.estimated_pickup_time ?? timeline.extimated_pickup_time),
    dropoffEta: time(timeline.estimated_delivery_time),
  };
}

export function verifyGlovoSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(header.trim(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const withStatus = (u: CourierPatch, fallback: CourierStatus): CourierUpdate => ({ ...u, status: u.status ?? fallback });

export const glovoProvider: CourierProvider = {
  async request(input, account) {
    const phone = e164(input.dropoff.phone);
    if (!phone) throw new CourierError("El teléfono del cliente no es válido para Glovo");
    // Glovo acepta pedidos programados con 45 min a 7 días de antelación.
    const ahead = input.deliverAt ? input.deliverAt.getTime() - Date.now() : 0;
    const body = {
      client_order_id: input.orderId,
      sender: {
        name: input.pickup.name,
        phone_number: e164(input.pickup.phone) ?? undefined,
        location: { address: input.pickup.location.address, latitude: input.pickup.location.lat, longitude: input.pickup.location.lng },
      },
      recipient: {
        name: input.dropoff.name,
        phone_number: phone,
        location: { address: input.dropoff.location.address, latitude: input.dropoff.location.lat, longitude: input.dropoff.location.lng },
        ...(input.dropoff.notes && { notes: input.dropoff.notes.slice(0, 500) }),
      },
      payment_method: input.paid ? "PAID" : "CASH_ON_DELIVERY",
      amount: input.paid ? 0 : input.amountCents / 100,
      currency_code: "EUR",
      description: input.description.slice(0, 1000),
      preordered_for: ahead >= 45 * 60_000 ? Math.floor(input.deliverAt!.getTime() / 1000) : null,
      pickup_tasks: { pickup_code: input.orderLabel },
      integrator: "order-saas",
    };
    return withStatus(fromGlovo(await call(account, "POST", "/orders", body)), "REQUESTED");
  },
  async fetch(d, account) {
    return fromGlovo(await call(account, "GET", `/orders/${encodeURIComponent(d.externalId)}`));
  },
  async cancel(externalId, account) {
    await call(account, "DELETE", `/orders/${encodeURIComponent(externalId)}`, { reason: "MISTAKE_ERROR" });
  },
};
