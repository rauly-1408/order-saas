import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getTenantSlug(req: NextRequest): string {
  const segments = new URL(req.url).pathname.split("/");
  return segments[segments.length - 1];
}

// GET /api/admin/[tenant] → datos del tenant (branding, settings, categorías, productos)
export async function GET(req: NextRequest) {
  try {
    const slug = getTenantSlug(req);
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, branding: true, settings: true },
    });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    const categories = await prisma.category.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        products: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true, name: true, description: true, basePriceCents: true,
            imageUrl: true, isActive: true, isAvailable: true, isFeatured: true, sortOrder: true,
          },
        },
      },
    });

    return NextResponse.json({ tenant, categories });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH /api/admin/[tenant] → actualizar branding y/o settings del tenant
export async function PATCH(req: NextRequest) {
  try {
    const slug = getTenantSlug(req);
    const body = await req.json();
    const { branding, settings, name } = body;

    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    const currentBranding = (tenant.branding as Record<string, unknown>) ?? {};
    const currentSettings = (tenant.settings as Record<string, unknown>) ?? {};

    const updated = await prisma.tenant.update({
      where: { slug },
      data: {
        ...(name !== undefined && { name }),
        ...(branding !== undefined && { branding: { ...currentBranding, ...branding } }),
        ...(settings !== undefined && { settings: { ...currentSettings, ...settings } }),
      },
    });

    return NextResponse.json({ ok: true, tenant: updated });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
