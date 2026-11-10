// Cartas de delivery (PriceList): utilidades comunes. Ver docs/REPARTO-PLATAFORMAS.md
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { PARTNERS, type PartnerKey } from "@/app/lib/deliveryPartners";

export const MAX_PRICE_LISTS = 30;
export const isPartner = (k: unknown): k is PartnerKey => PARTNERS.some((p) => p.key === k);

export function readPrices(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000) out[k] = v;
  return out;
}

export function readDescriptions(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 500);
  return out;
}

export function readImages(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries((raw ?? {}) as Record<string, unknown>)) if (typeof v === "string" && v.trim() && v.length <= 1000) out[k] = v.trim();
  return out;
}

export async function priceListTenant(req: NextRequest): Promise<{ tenant: { id: string; settings: unknown } } | { error: NextResponse }> {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}
