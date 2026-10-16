import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

// Guard de /api/admin/[tenant]/combos/*: gerente del restaurante.
export async function comboTenant(req: NextRequest): Promise<{ tenant: { id: string } } | { error: NextResponse }> {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

export type ComboInput = {
  name: string;
  description: string | null;
  priceCents: number;
  isAvailable: boolean;
  slots: { name: string; items: { productId: string; extraCents: number }[] }[];
};

// Valida el combo; los productos de cada paso tienen que ser del restaurante y no combos.
export function parseCombo(body: unknown, validProductIds: Set<string>): ComboInput | string {
  const b = (body ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 80) return "Ponle nombre al menú (máx. 80 caracteres)";
  const description = typeof b.description === "string" && b.description.trim() ? b.description.trim().slice(0, 300) : null;
  const priceCents = Number(b.priceCents);
  if (!Number.isInteger(priceCents) || priceCents <= 0 || priceCents > 100_000) return "El precio del menú no es válido";
  const rawSlots = Array.isArray(b.slots) ? b.slots : [];
  if (rawSlots.length < 1 || rawSlots.length > 6) return "Un menú tiene de 1 a 6 pasos";
  const slots: ComboInput["slots"] = [];
  for (const raw of rawSlots) {
    const r = (raw ?? {}) as Record<string, unknown>;
    const slotName = typeof r.name === "string" ? r.name.trim() : "";
    if (!slotName || slotName.length > 60) return "Cada paso necesita un nombre (p. ej. «Elige tu bebida»)";
    const items = (Array.isArray(r.items) ? r.items : [])
      .map((i) => (i ?? {}) as Record<string, unknown>)
      .map((i) => ({ productId: String(i.productId ?? ""), extraCents: Number(i.extraCents ?? 0) }));
    if (!items.length) return `«${slotName}»: elige al menos un producto`;
    if (items.some((i) => !validProductIds.has(i.productId))) return `«${slotName}»: algún producto no es válido`;
    if (items.some((i) => !Number.isInteger(i.extraCents) || i.extraCents < 0 || i.extraCents > 10_000)) return `«${slotName}»: suplemento no válido`;
    if (new Set(items.map((i) => i.productId)).size !== items.length) return `«${slotName}»: hay productos repetidos`;
    slots.push({ name: slotName, items });
  }
  return { name, description, priceCents, isAvailable: b.isAvailable !== false, slots };
}

// Los combos van en la categoría «Menús» (se crea la primera vez, al principio de la carta).
export async function menusCategoryId(tenantId: string): Promise<string> {
  const existing = await prisma.category.findFirst({ where: { tenantId, slug: "menus" }, select: { id: true } });
  if (existing) return existing.id;
  const first = await prisma.category.aggregate({ where: { tenantId }, _min: { sortOrder: true } });
  const created = await prisma.category.create({
    data: { tenantId, name: "Menús", slug: "menus", sortOrder: (first._min.sortOrder ?? 0) - 1, description: "Combos a precio cerrado" },
    select: { id: true },
  });
  return created.id;
}

export const slotsCreate = (tenantId: string, input: ComboInput) =>
  input.slots.map((s, i) => ({
    tenantId,
    name: s.name,
    sortOrder: i,
    items: { create: s.items.map((it, j) => ({ productId: it.productId, extraCents: it.extraCents, sortOrder: j })) },
  }));
