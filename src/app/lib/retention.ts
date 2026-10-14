// Motor de retención (addon RETENTION): segmentos, cupones, mensajes de campaña
// y atribución. Funciones puras — las rutas API se encargan de la base de datos.
// Ver docs/SPRINT-03.md

export type Segment = "NEW" | "REGULAR" | "VIP" | "AT_RISK";
export const SEGMENTS: Segment[] = ["NEW", "REGULAR", "VIP", "AT_RISK"];

export const SEGMENT_LABEL: Record<Segment, string> = {
  NEW: "Nuevos",
  REGULAR: "Habituales",
  VIP: "VIP",
  AT_RISK: "En riesgo",
};

// Un buen cliente que lleva este tiempo sin pedir pasa a "en riesgo".
export const AT_RISK_DAYS = 30;
// Un pedido cuenta como conversión si llega en este plazo tras el mensaje.
export const ATTRIBUTION_DAYS = 14;

const DAY_MS = 86_400_000;

// Normaliza el teléfono a una clave estable: solo dígitos (y un + inicial
// opcional). Evita que "600 123 123" y "600123123" creen dos clientes.
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasPlus ? `+${digits}` : digits;
}

// Segmento según el historial. AT_RISK gana sobre todo: un buen cliente que
// dejó de venir es la prioridad de retención. Se recalcula con la fecha actual
// al leer, así "en riesgo" se activa aunque el cliente no vuelva a pedir.
export function computeSegment(ordersCount: number, totalSpentCents: number, lastOrderAt: Date | null, now = new Date()): Segment {
  const daysSinceLast = lastOrderAt ? (now.getTime() - lastOrderAt.getTime()) / DAY_MS : 0;
  if (ordersCount >= 2 && daysSinceLast > AT_RISK_DAYS) return "AT_RISK";
  if (ordersCount >= 6 || totalSpentCents >= 15_000) return "VIP";
  if (ordersCount >= 2) return "REGULAR";
  return "NEW";
}

export function daysSince(date: Date | null, now = new Date()): number | null {
  return date ? Math.floor((now.getTime() - date.getTime()) / DAY_MS) : null;
}

// ── Cupones ─────────────────────────────────────────────────────────────

export type CouponRules = {
  type: "PERCENT" | "FIXED";
  value: number;
  minOrderCents: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  active: boolean;
  expiresAt: Date | null;
};

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

// Descuento en céntimos sobre el subtotal (nunca mayor que el subtotal).
export function couponDiscount(c: Pick<CouponRules, "type" | "value">, subtotalCents: number): number {
  const raw = c.type === "PERCENT" ? Math.round((subtotalCents * Math.min(Math.max(c.value, 0), 100)) / 100) : Math.max(c.value, 0);
  return Math.min(raw, subtotalCents);
}

// Motivo por el que no se puede aplicar el cupón, o null si es válido.
export function couponProblem(c: CouponRules, subtotalCents: number, now = new Date()): string | null {
  if (!c.active) return "Este cupón ya no está activo";
  if (c.expiresAt && c.expiresAt.getTime() < now.getTime()) return "Este cupón ha caducado";
  if (c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions) return "Este cupón ya se ha agotado";
  if (subtotalCents < c.minOrderCents) return `Pedido mínimo para este cupón: ${euros(c.minOrderCents)}`;
  return null;
}

export function couponLabel(c: Pick<CouponRules, "type" | "value">): string {
  return c.type === "PERCENT" ? `${c.value} %` : euros(c.value);
}

// Código legible para un cupón creado en un clic: VUELVE15, VIP10…
export function suggestCode(segment: Segment, value: number): string {
  const prefix: Record<Segment, string> = { NEW: "BIENVENIDA", REGULAR: "GRACIAS", VIP: "VIP", AT_RISK: "VUELVE" };
  return `${prefix[segment]}${value}`;
}

// ── Mensajes ────────────────────────────────────────────────────────────

// Plantillas de partida por segmento (el dueño las edita antes de enviar).
export const MESSAGE_TEMPLATES: Record<Segment, string> = {
  NEW: "¡Hola {nombre}! Gracias por tu primer pedido en {restaurante}. Para la próxima, usa el código {cupon} y tendrás {descuento} de descuento. Pide aquí: {enlace}",
  REGULAR: "¡Hola {nombre}! Gracias por seguir confiando en {restaurante}. Esta semana tienes {descuento} con el código {cupon}: {enlace}",
  VIP: "¡Hola {nombre}! Eres de nuestros mejores clientes y queremos darte las gracias: {descuento} en tu próximo pedido con el código {cupon}. {enlace}",
  AT_RISK: "¡Hola {nombre}! Hace tiempo que no te vemos por {restaurante} y te echamos de menos. Vuelve con {descuento} de descuento usando el código {cupon}: {enlace}",
};

// Texto de baja que acompaña SIEMPRE a los mensajes comerciales (RGPD / LSSI).
export const OPT_OUT_TEXT = "Si no quieres recibir más mensajes, responde BAJA.";

export type MessageVars = { nombre: string; restaurante: string; enlace: string; cupon?: string | null; descuento?: string | null };

export function renderMessage(template: string, v: MessageVars): string {
  const firstName = v.nombre.trim().split(/\s+/)[0] || "";
  const body = template
    .replaceAll("{nombre}", firstName)
    .replaceAll("{restaurante}", v.restaurante)
    .replaceAll("{enlace}", v.enlace)
    .replaceAll("{cupon}", v.cupon ?? "")
    .replaceAll("{descuento}", v.descuento ?? "")
    .replace(/¡Hola !/g, "¡Hola!")
    .trim();
  return `${body}\n\n${OPT_OUT_TEXT}`;
}

// ── Atribución ──────────────────────────────────────────────────────────

// ¿El pedido llega dentro de la ventana de atribución del envío?
export function withinAttribution(sentAt: Date, orderAt: Date): boolean {
  const diff = orderAt.getTime() - sentAt.getTime();
  return diff >= 0 && diff <= ATTRIBUTION_DAYS * DAY_MS;
}

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}
