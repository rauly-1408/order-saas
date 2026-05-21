import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

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

    const body = await req.json();
    const { name, description, basePriceCents, categoryId, imageUrl, isActive, isAvailable, isFeatured, sortOrder } = body;

    if (!name?.trim() || typeof basePriceCents !== "number" || !categoryId) {
      return NextResponse.json({ error: "Faltan campos requeridos: name, basePriceCents, categoryId" }, { status: 400 });
    }

    // Verificar que la categoría pertenece al tenant
    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId: tenant.id } });
    if (!category) return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });

    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId,
        name: name.trim(),
        description: description?.trim() ?? null,
        basePriceCents,
        imageUrl: imageUrl?.trim() ?? null,
        isActive: isActive ?? true,
        isAvailable: isAvailable ?? true,
        isFeatured: isFeatured ?? false,
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json({ ok: true, product }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
