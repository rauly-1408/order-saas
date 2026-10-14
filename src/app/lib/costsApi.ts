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

export type SupplierInput = { name: string; contactName: string | null; phone: string | null; email: string | null; notes: string | null };

export function parseSupplier(body: unknown): SupplierInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = trimOrNull(b.name);
  if (!name) return "El nombre es obligatorio";
  return { name, contactName: trimOrNull(b.contactName), phone: trimOrNull(b.phone), email: trimOrNull(b.email), notes: trimOrNull(b.notes) };
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
