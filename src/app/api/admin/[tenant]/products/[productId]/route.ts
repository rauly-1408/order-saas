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

function getParams(req: NextRequest): { tenantSlug: string; productId: string } {
  const parts = new URL(req.url).pathname.split("/");
  const adminIdx = parts.indexOf("admin");
  return { tenantSlug: parts[adminIdx + 1], productId: parts[parts.length - 1] };
}

// PATCH /api/admin/[tenant]/products/[productId] → actualizar producto
export async function PATCH(req: NextRequest) {
  try {
    const { tenantSlug, productId } = getParams(req);
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;
    // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
    after(() => autoTranslateMenu(tenant.id));
    after(() => revalidateMenu(tenant.id));

    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant.id } });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const body = await req.json();
    const { name, description, basePriceCents, categoryId, imageUrl, isActive, isAvailable, isFeatured, dietTags, allergens, onlinePriceCents, sortOrder } = body;
    // Precio en la web: null = el mismo que en el local.
    const webPrice = onlinePriceCents === null || onlinePriceCents === undefined ? null : Number.isInteger(onlinePriceCents) && onlinePriceCents >= 0 && onlinePriceCents <= 1_000_00 ? (onlinePriceCents as number) : NaN;
    if (Number.isNaN(webPrice)) return NextResponse.json({ error: "Precio de la web no válido" }, { status: 400 });
    const img = imageUrl === undefined ? { value: null } : productImageUrl(imageUrl, tenantSlug);
    if ("error" in img) return NextResponse.json({ error: img.error }, { status: 400 });

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() ?? null }),
        ...(basePriceCents !== undefined && { basePriceCents }),
        ...(categoryId !== undefined && { categoryId }),
        ...(imageUrl !== undefined && { imageUrl: img.value }),
        ...(isActive !== undefined && { isActive }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isFeatured !== undefined && { isFeatured }),
        ...(dietTags !== undefined && { dietTags: parseDietTags(dietTags) }),
        ...(onlinePriceCents !== undefined && { onlinePriceCents: webPrice }),
        ...(Array.isArray(allergens) && { allergens: normalizeAllergens(allergens.filter((a: unknown): a is string => typeof a === "string")) }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json({ ok: true, product: updated });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE /api/admin/[tenant]/products/[productId] → eliminar producto
export async function DELETE(req: NextRequest) {
  try {
    const { tenantSlug, productId } = getParams(req);
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;
    // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
    after(() => autoTranslateMenu(tenant.id));
    after(() => revalidateMenu(tenant.id));

    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant.id } });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    // Los vínculos con grupos de modificadores tienen FK al producto: se borran antes.
    await prisma.$transaction([
      prisma.productModifierGroup.deleteMany({ where: { productId } }),
      prisma.product.delete({ where: { id: productId } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
