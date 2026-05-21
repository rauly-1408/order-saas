import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

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

    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant.id } });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const body = await req.json();
    const { name, description, basePriceCents, categoryId, imageUrl, isActive, isAvailable, isFeatured, sortOrder } = body;

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() ?? null }),
        ...(basePriceCents !== undefined && { basePriceCents }),
        ...(categoryId !== undefined && { categoryId }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() ?? null }),
        ...(isActive !== undefined && { isActive }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isFeatured !== undefined && { isFeatured }),
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

    const product = await prisma.product.findFirst({ where: { id: productId, tenantId: tenant.id } });
    if (!product) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    await prisma.product.delete({ where: { id: productId } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
