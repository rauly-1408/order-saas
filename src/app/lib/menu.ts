import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, getTenantSettings } from "@/app/lib/tenantConfig";
import type { MenuModifierGroup } from "@/app/lib/menuOptions";
import { ALLERGENS } from "@/app/lib/costs";
import { getStoreOps, publicStoreInfo } from "@/app/lib/storeOps";
import { loadPerks, publicPerks } from "@/app/lib/perks";
import { parseOnline } from "@/app/lib/brand";

// Carga la carta pública de un tenant (tema, ajustes, categorías y productos
// con sus opciones). La usan la API /api/menu/[tenant] y las páginas de
// /pedir directamente — las páginas NO deben llamarse a sí mismas por HTTP
// (en Vercel esa auto-llamada fallaba en producción).
export async function loadMenu(tenantSlug: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true, branding: true, settings: true, addons: true },
  });
  if (!tenant) return null;

  // getTenantTheme combina los valores del tenant con los defaults del sistema
  const theme = getTenantTheme(tenant.branding as Record<string, unknown>);
  const ops = await getStoreOps(tenant.id, tenant.settings);
  // Lo operativo (canales, envío, mínimo, tiempos) sale del local: es lo que cobran los pedidos.
  const settings = {
    ...getTenantSettings(tenant.settings as Record<string, unknown>),
    ...(ops && {
      deliveryEnabled: ops.deliveryEnabled,
      takeawayEnabled: ops.takeawayEnabled,
      deliveryFeeCents: ops.deliveryFeeCents,
      minimumOrderCents: ops.minimumOrderCents,
      estimatedDeliveryMinutes: ops.estimatedDeliveryMinutes + ops.prepExtraMinutes,
      estimatedPickupMinutes: ops.estimatedPickupMinutes + ops.prepExtraMinutes,
    }),
  };
  const store = ops ? publicStoreInfo(ops) : null;
  // Promociones en vigor y tarjeta de fidelidad (motor de retención).
  const perks = publicPerks(await loadPerks(tenant.id, tenant.settings, tenant.addons));

  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      products: {
        where: { isActive: true, isAvailable: true, stockOut: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          basePriceCents: true,
          imageUrl: true,
          isFeatured: true,
          hasModifiers: true,
          // Combos: huecos y productos elegibles (el cliente solo ve los disponibles).
          isCombo: true,
          comboSlots: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, items: { orderBy: { sortOrder: "asc" }, select: { productId: true, extraCents: true } } },
          },
          // Alérgenos derivados del escandallo (módulo Costes); vacío si no hay receta.
          recipeLines: { select: { ingredient: { select: { allergens: true } } } },
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
                    where: { isAvailable: true, stockOut: false },
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      name: true,
                      priceDeltaCents: true,
                      recipeLines: { select: { ingredient: { select: { allergens: true } } } },
                    },
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
    products: cat.products.map(({ modifierGroups, recipeLines, ...product }) => ({
      ...product,
      description: product.description ?? "",
      allergens: allergensOf(recipeLines),
      modifierGroups: modifierGroups.map(
        (pmg): MenuModifierGroup => ({
          ...pmg.group,
          defaultOptionId: pmg.defaultOptionId,
          options: pmg.group.options.map(({ recipeLines: optLines, ...o }) => ({ ...o, allergens: allergensOf(optLines) })),
        })
      ),
    })),
  }));

  return {
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    theme,
    settings,
    store,
    perks,
    online: parseOnline((tenant.branding as Record<string, unknown> | null)?.online),
    categories: menuCategories,
  };
}

// Unión de alérgenos de las líneas de un escandallo, en el orden oficial.
function allergensOf(lines: { ingredient: { allergens: string[] } }[]): string[] {
  const found = new Set(lines.flatMap((l) => l.ingredient.allergens));
  return ALLERGENS.filter((a) => found.has(a));
}

export type LoadedMenu = NonNullable<Awaited<ReturnType<typeof loadMenu>>>;
