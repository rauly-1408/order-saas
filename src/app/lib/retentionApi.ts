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
