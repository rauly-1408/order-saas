import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { comboTenant, menusCategoryId, parseCombo, slotsCreate } from "@/app/lib/combosApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → combos del restaurante y los productos que se pueden meter en ellos.
export async function GET(req: NextRequest) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const [combos, categories] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, isCombo: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, description: true, basePriceCents: true, isActive: true, isAvailable: true,
        comboSlots: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, items: { orderBy: { sortOrder: "asc" }, select: { productId: true, extraCents: true } } } },
      },
    }),
    prisma.category.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, products: { where: { isCombo: false }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, basePriceCents: true, isActive: true } } },
    }),
  ]);
  return NextResponse.json({ combos, categories: categories.filter((c) => c.products.length) });
}

// POST → crear combo
export async function POST(req: NextRequest) {
  const ctx = await comboTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const valid = await prisma.product.findMany({ where: { tenantId, isCombo: false }, select: { id: true } });
  const input = parseCombo(await req.json().catch(() => null), new Set(valid.map((p) => p.id)));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const categoryId = await menusCategoryId(tenantId);
  const slugBase = input.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const combo = await prisma.product.create({
    data: {
      tenantId,
      categoryId,
      isCombo: true,
      name: input.name,
      slug: `${slugBase || "menu"}-${Date.now()}`,
      description: input.description,
      basePriceCents: input.priceCents,
      isAvailable: input.isAvailable,
      comboSlots: { create: slotsCreate(tenantId, input) },
    },
    select: { id: true },
  });
  return NextResponse.json({ combo }, { status: 201 });
}
