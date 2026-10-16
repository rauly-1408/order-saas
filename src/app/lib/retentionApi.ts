import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { normalizeCode, SEGMENTS, type Segment } from "@/app/lib/retention";

// Guard común de /api/admin/[tenant]/retention/*: dueño/superadmin del tenant Y
// motor de retención contratado. Devuelve el tenant o la respuesta de error.
export async function retentionTenant(
  req: NextRequest
): Promise<{ tenant: { id: string; slug: string; name: string } } | { error: NextResponse }> {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, name: true, addons: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  if (!tenant.addons.includes("RETENTION")) {
    return { error: NextResponse.json({ error: "El motor de retención no está contratado" }, { status: 402 }) };
  }
  return { tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name } };
}

const trimOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export type CouponInput = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minOrderCents: number;
  maxRedemptions: number | null;
  oncePerCustomer: boolean;
  expiresAt: Date | null;
};

export function parseCoupon(body: unknown): CouponInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const code = typeof b.code === "string" ? normalizeCode(b.code) : "";
  if (!/^[A-Z0-9_-]{3,20}$/.test(code)) return "El código debe tener de 3 a 20 letras o números, sin espacios";
  if (b.type !== "PERCENT" && b.type !== "FIXED") return "Tipo de descuento no válido";
  const value = Number(b.value);
  if (!Number.isInteger(value) || value <= 0) return "El descuento debe ser mayor que 0";
  if (b.type === "PERCENT" && value > 100) return "El porcentaje no puede pasar de 100";
  const minOrderCents = b.minOrderCents == null || b.minOrderCents === "" ? 0 : Number(b.minOrderCents);
  if (!Number.isInteger(minOrderCents) || minOrderCents < 0) return "Pedido mínimo no válido";
  const maxRedemptions = b.maxRedemptions == null || b.maxRedemptions === "" ? null : Number(b.maxRedemptions);
  if (maxRedemptions != null && (!Number.isInteger(maxRedemptions) || maxRedemptions <= 0)) return "Número de usos no válido";
  let expiresAt: Date | null = null;
  const rawExp = trimOrNull(b.expiresAt);
  if (rawExp) {
    // Fecha del formulario (AAAA-MM-DD): válida hasta el final de ese día.
    expiresAt = new Date(/^\d{4}-\d{2}-\d{2}$/.test(rawExp) ? `${rawExp}T23:59:59` : rawExp);
    if (Number.isNaN(expiresAt.getTime())) return "Fecha de caducidad no válida";
  }
  return { code, type: b.type, value, minOrderCents, maxRedemptions, oncePerCustomer: b.oncePerCustomer !== false, expiresAt };
}

export type CampaignInput = { name: string; targetSegment: Segment; messageBody: string; couponId: string | null };

export function parseCampaign(body: unknown): CampaignInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = trimOrNull(b.name);
  if (!name) return "Ponle un nombre a la campaña";
  if (!SEGMENTS.includes(b.targetSegment as Segment)) return "Elige a quién va dirigida";
  const messageBody = trimOrNull(b.messageBody);
  if (!messageBody) return "Escribe el mensaje";
  if (messageBody.length > 900) return "El mensaje es demasiado largo (máx. 900 caracteres)";
  const couponId = trimOrNull(b.couponId);
  if (messageBody.includes("{cupon}") && !couponId) return "El mensaje usa {cupon}: elige un cupón o quítalo del texto";
  return { name, targetSegment: b.targetSegment as Segment, messageBody, couponId };
}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// URL pública de la carta para los mensajes: la del propio despliegue.
export function publicMenuUrl(req: NextRequest, slug: string): string {
  return `${new URL(req.url).origin}/pedir/${slug}`;
}

// ── Promociones automáticas y tarjeta de fidelidad ──────────────────────
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type PromotionInput = {
  name: string;
  kind: "ORDER_PERCENT" | "ORDER_FIXED" | "FREE_DELIVERY";
  value: number;
  minOrderCents: number;
  weekdays: number[];
  startTime: string | null;
  endTime: string | null;
  channel: "DELIVERY" | "TAKEAWAY" | null;
  firstOrderOnly: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

function dateOrNull(v: unknown, endOfDay: boolean): Date | null | "invalid" {
  const raw = trimOrNull(v);
  if (!raw) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T${endOfDay ? "23:59:59" : "00:00:00"}` : raw);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

export function parsePromotion(body: unknown): PromotionInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = trimOrNull(b.name);
  if (!name || name.length > 60) return "Ponle un nombre a la promoción (máx. 60 caracteres)";
  if (b.kind !== "ORDER_PERCENT" && b.kind !== "ORDER_FIXED" && b.kind !== "FREE_DELIVERY") return "Tipo de promoción no válido";
  const value = b.kind === "FREE_DELIVERY" ? 0 : Number(b.value);
  if (!Number.isInteger(value) || value < 0 || (b.kind !== "FREE_DELIVERY" && value === 0)) return "El descuento debe ser mayor que 0";
  if (b.kind === "ORDER_PERCENT" && value > 100) return "El porcentaje no puede pasar de 100";
  const minOrderCents = b.minOrderCents == null || b.minOrderCents === "" ? 0 : Number(b.minOrderCents);
  if (!Number.isInteger(minOrderCents) || minOrderCents < 0) return "Pedido mínimo no válido";
  const weekdays = Array.isArray(b.weekdays) ? [...new Set(b.weekdays.map(Number))] : [];
  if (weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return "Días no válidos";
  const startTime = trimOrNull(b.startTime);
  const endTime = trimOrNull(b.endTime);
  if (!!startTime !== !!endTime) return "Indica la hora de inicio y la de fin, o ninguna";
  if ((startTime && !HHMM.test(startTime)) || (endTime && !HHMM.test(endTime))) return "Horas no válidas";
  if (startTime && startTime === endTime) return "La hora de inicio y la de fin no pueden ser iguales";
  const channel = b.channel === "DELIVERY" || b.channel === "TAKEAWAY" ? b.channel : null;
  const startsAt = dateOrNull(b.startsAt, false);
  const endsAt = dateOrNull(b.endsAt, true);
  if (startsAt === "invalid" || endsAt === "invalid") return "Fechas no válidas";
  if (startsAt && endsAt && endsAt <= startsAt) return "La fecha de fin debe ser posterior a la de inicio";
  return { name, kind: b.kind, value, minOrderCents, weekdays: weekdays.sort(), startTime, endTime, channel, firstOrderOnly: b.firstOrderOnly === true, startsAt, endsAt };
}

export type LoyaltyInput = {
  active: boolean;
  ordersRequired: number;
  rewardName: string;
  rewardSlots: { label: string; categoryIds: string[] }[];
  maxRewardCents: number | null;
};

export function parseLoyalty(body: unknown, validCategoryIds: Set<string>): LoyaltyInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const ordersRequired = Number(b.ordersRequired);
  if (!Number.isInteger(ordersRequired) || ordersRequired < 2 || ordersRequired > 50) return "El premio debe llegar entre el 2.º y el 50.º pedido";
  const rewardName = trimOrNull(b.rewardName);
  if (!rewardName || rewardName.length > 80) return "Describe el premio (máx. 80 caracteres)";
  const slots = Array.isArray(b.rewardSlots) ? b.rewardSlots : [];
  const rewardSlots = slots.map((s) => {
    const r = (s ?? {}) as Record<string, unknown>;
    return {
      label: trimOrNull(r.label) ?? "",
      categoryIds: Array.isArray(r.categoryIds) ? r.categoryIds.filter((c): c is string => typeof c === "string" && validCategoryIds.has(c)) : [],
    };
  });
  if (!rewardSlots.length || rewardSlots.length > 4) return "El premio debe tener entre 1 y 4 productos";
  if (rewardSlots.some((s) => !s.label || !s.categoryIds.length)) return "Cada producto del premio necesita un nombre y al menos una categoría";
  const maxRewardCents = b.maxRewardCents == null || b.maxRewardCents === "" ? null : Number(b.maxRewardCents);
  if (maxRewardCents != null && (!Number.isInteger(maxRewardCents) || maxRewardCents <= 0)) return "Tope del premio no válido";
  return { active: b.active !== false, ordersRequired, rewardName, rewardSlots, maxRewardCents };
}
