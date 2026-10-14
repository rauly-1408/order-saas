import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, getTenantSettings } from "@/app/lib/tenantConfig";
import type { MenuModifierGroup } from "@/app/lib/menuOptions";

// Carga la carta pública de un tenant (tema, ajustes, categorías y productos
// con sus opciones). La usan la API /api/menu/[tenant] y las páginas de
// /pedir directamente — las páginas NO deben llamarse a sí mismas por HTTP
// (en Vercel esa auto-llamada fallaba en producción).
export async function loadMenu(tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true, branding: true, settings: true },
  });
  if (!tenant) return null;

  // getTenantTheme combina los valores del tenant con los defaults del sistema
  const theme = getTenantTheme(tenant.branding as Record<string, unknown>);
  const settings = getTenantSettings(tenant.settings as Record<string, unknown>);

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
      description: product.description ?? "",
      modifierGroups: modifierGroups.map(
        (pmg): MenuModifierGroup => ({ ...pmg.group, defaultOptionId: pmg.defaultOptionId })
      ),
    })),
  }));

  return {
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    theme,
    settings,
    categories: menuCategories,
  };
}

export type LoadedMenu = NonNullable<Awaited<ReturnType<typeof loadMenu>>>;
