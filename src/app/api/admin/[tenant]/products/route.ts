import { parseDietTags } from "@/app/lib/diet";
import { normalizeAllergens } from "@/app/lib/costs";
import { NextRequest, NextResponse, after } from "next/server";
import { productImageUrl } from "@/app/lib/media";
import { autoTranslateMenu } from "@/app/lib/menuTranslate";
import { revalidateMenu } from "@/app/lib/menuCache";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTenantSlug(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  // /api/admin/[tenant]/products
  return parts[parts.indexOf("admin") + 1];
}

// POST /api/admin/[tenant]/products → crear producto
export async function POST(req: NextRequest) {
  try {
    const slug = getTenantSlug(req);
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;
    // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
    after(() => autoTranslateMenu(tenant.id));
    after(() => revalidateMenu(tenant.id));

    const body = await req.json();
    const { name, description, basePriceCents, categoryId, imageUrl, isActive, isAvailable, isFeatured, dietTags, allergens, sortOrder } = body;

    if (!name?.trim() || typeof basePriceCents !== "number" || !categoryId) {
      return NextResponse.json({ error: "Faltan campos requeridos: name, basePriceCents, categoryId" }, { status: 400 });
    }

    // Verificar que la categoría pertenece al tenant
    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId: tenant.id } });
    if (!category) return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });
    const img = productImageUrl(imageUrl, slug);
    if ("error" in img) return NextResponse.json({ error: img.error }, { status: 400 });

    // Slug único por tenant (misma convención que categorías): nombre sin tildes + timestamp.
    const baseSlug = name
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId,
        name: name.trim(),
        slug: `${baseSlug}-${Date.now()}`,
        description: description?.trim() ?? null,
        basePriceCents,
        imageUrl: img.value,
        isActive: isActive ?? true,
        isAvailable: isAvailable ?? true,
        isFeatured: isFeatured ?? false,
        dietTags: parseDietTags(dietTags),
        allergens: Array.isArray(allergens) ? normalizeAllergens(allergens.filter((a: unknown): a is string => typeof a === "string")) : [],
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json({ ok: true, product }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
