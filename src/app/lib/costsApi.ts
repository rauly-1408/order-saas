import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { normalizeAllergens } from "@/app/lib/costs";

// Guard común de /api/admin/[tenant]/costs/*: dueño/superadmin del tenant Y
// módulo COSTS contratado. Devuelve el tenant o la respuesta de error.
export async function costsTenant(
  req: NextRequest
): Promise<{ tenant: { id: string; slug: string } } | { error: NextResponse }> {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, addons: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  if (!tenant.addons.includes("COSTS")) {
    return { error: NextResponse.json({ error: "El módulo Costes no está contratado" }, { status: 402 }) };
  }
  return { tenant: { id: tenant.id, slug: tenant.slug } };
}

export function lastSegment(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.length - 1];
}

const trimOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const ORDER_METHODS = ["WHATSAPP", "EMAIL", "PHONE", "IN_PERSON"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SupplierInput = {
  name: string;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  extraEmails: string[];
  notes: string | null;
  orderMethod: (typeof ORDER_METHODS)[number];
  deliveryDays: number[];
  leadDays: number;
  orderCutoff: string | null;
  minOrderCents: number | null;
};

export function parseSupplier(body: unknown): SupplierInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = trimOrNull(b.name);
  if (!name) return "El nombre es obligatorio";

  const email = trimOrNull(b.email);
  const extraEmails = Array.isArray(b.extraEmails)
    ? [...new Set(b.extraEmails.map((e) => (typeof e === "string" ? e.trim() : "")).filter(Boolean))]
    : [];
  for (const e of [email, ...extraEmails]) if (e && !EMAIL_RE.test(e)) return `Email no válido: ${e}`;
  if (extraEmails.length > 5) return "Máximo 5 emails adicionales";

  const orderMethod = b.orderMethod == null ? "WHATSAPP" : b.orderMethod;
  if (!ORDER_METHODS.includes(orderMethod as (typeof ORDER_METHODS)[number])) return "Método de pedido no válido";

  const deliveryDays = Array.isArray(b.deliveryDays)
    ? [...new Set(b.deliveryDays.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((x, y) => x - y)
    : [];
  const leadDays = b.leadDays == null || b.leadDays === "" ? 1 : Number(b.leadDays);
  if (!Number.isInteger(leadDays) || leadDays < 0 || leadDays > 14) return "La antelación debe estar entre 0 y 14 días";
  const orderCutoff = trimOrNull(b.orderCutoff);
  if (orderCutoff && !/^([01]\d|2[0-3]):[0-5]\d$/.test(orderCutoff)) return "Hora límite no válida (HH:MM)";
  const minOrderCents = b.minOrderCents == null || b.minOrderCents === "" ? null : Number(b.minOrderCents);
  if (minOrderCents != null && (!Number.isInteger(minOrderCents) || minOrderCents < 0)) return "Pedido mínimo no válido";

  if (orderMethod === "EMAIL" && !email) return "Para pedir por email, indica el email del proveedor";
  return {
    name,
    contactName: trimOrNull(b.contactName),
    phone: trimOrNull(b.phone),
    whatsapp: trimOrNull(b.whatsapp),
    email,
    extraEmails: extraEmails.filter((e) => e !== email),
    notes: trimOrNull(b.notes),
    orderMethod: orderMethod as SupplierInput["orderMethod"],
    deliveryDays,
    leadDays,
    orderCutoff,
    minOrderCents,
  };
}

const UNITS = ["KG", "G", "L", "ML", "UNIT"] as const;
export type IngredientInput = {
  name: string;
  baseUnit: (typeof UNITS)[number];
  packSize: number;
  packPriceCents: number;
  wastePct: number;
  allergens: string[];
  supplierId: string | null;
};

export function parseIngredient(body: unknown): IngredientInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = trimOrNull(b.name);
  if (!name) return "El nombre es obligatorio";
  if (!UNITS.includes(b.baseUnit as (typeof UNITS)[number])) return "Unidad no válida";
  const packSize = Number(b.packSize);
  const packPriceCents = Number(b.packPriceCents);
  const wastePct = b.wastePct == null || b.wastePct === "" ? 0 : Number(b.wastePct);
  if (!(packSize > 0)) return "La cantidad del formato debe ser mayor que 0";
  if (!Number.isInteger(packPriceCents) || packPriceCents < 0) return "Precio no válido";
  if (!(wastePct >= 0 && wastePct < 100)) return "La merma debe estar entre 0 y 99 %";
  const allergens = Array.isArray(b.allergens) ? normalizeAllergens(b.allergens.filter((a): a is string => typeof a === "string")) : [];
  return { name, baseUnit: b.baseUnit as IngredientInput["baseUnit"], packSize, packPriceCents, wastePct, allergens, supplierId: trimOrNull(b.supplierId) };
}

// Un nombre repetido (índice único tenant+name) llega como P2002.
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
