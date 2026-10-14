import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, getTenantSettings } from "@/app/lib/tenantConfig";
import type { MenuModifierGroup } from "@/app/lib/menuOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    // pathname: /api/menu/[tenant]
    const tenantSlug = segments[segments.length - 1];

    if (!tenantSlug) {
      return NextResponse.json({ error: "Tenant requerido" }, { status: 400 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        slug: true,
        name: true,
        branding: true,
        settings: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    // Procesar tema y configuración desde JSON de la DB
    // getTenantTheme combina los valores del tenant con los defaults del sistema
    const theme = getTenantTheme(tenant.branding as Record<string, unknown>);
    const storeSettings = getTenantSettings(tenant.settings as Record<string, unknown>);

    const categories = await prisma.category.findMany({
      where: { tenantId: tenant.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        products: {
          where: { isActive: true, isAvailable: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            basePriceCents: true,
            imageUrl: true,
            isFeatured: true,
            hasModifiers: true,
            modifierGroups: {
              orderBy: { sortOrder: "asc" },
              select: {
                defaultOptionId: true,
                group: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    isRequired: true,
                    minSelect: true,
                    maxSelect: true,
                    options: {
                      where: { isAvailable: true },
                      orderBy: { sortOrder: "asc" },
                      select: { id: true, name: true, priceDeltaCents: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Aplana ProductModifierGroup -> MenuModifierGroup (con la opción por defecto del producto).
    const menuCategories = categories.map((cat) => ({
      ...cat,
      products: cat.products.map(({ modifierGroups, ...product }) => ({
        ...product,
        modifierGroups: modifierGroups.map(
          (pmg): MenuModifierGroup => ({ ...pmg.group, defaultOptionId: pmg.defaultOptionId })
        ),
      })),
    }));

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
      },
      theme,
      settings: storeSettings,
      categories: menuCategories,
    });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
