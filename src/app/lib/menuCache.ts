import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "@/app/lib/prisma";

// Caché de la carta pública (categorías, productos, opciones y menús). Es la
// consulta más pesada de la tienda y cada visita la hacía de nuevo. Se guarda
// por restaurante hasta 60 s y se invalida al momento cuando el panel cambia
// la carta (productos, categorías, menús, traducciones, agotados).
// Lo que depende de la hora (abierto/cerrado, huecos para programar) y las
// promociones NO pasan por aquí. Ver docs/OPERACIONES.md

export const MENU_CACHE_SECONDS = 60;

export const menuTag = (tenantId: string) => `menu:${tenantId}`;

function queryCategories(tenantId: string) {
  return prisma.category.findMany({
    where: { tenantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      products: {
        where: { isActive: true, isAvailable: true, stockOut: false },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          translations: true,
          basePriceCents: true,
          onlinePriceCents: true,
          imageUrl: true,
          isFeatured: true,
          dietTags: true,
          allergens: true,
          hasModifiers: true,
          // Combos: huecos y productos elegibles (el cliente solo ve los disponibles).
          isCombo: true,
          comboSlots: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, required: true, translations: true, items: { orderBy: { sortOrder: "asc" }, select: { productId: true, extraCents: true } } },
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
                  translations: true,
                  isRequired: true,
                  minSelect: true,
                  maxSelect: true,
                  options: {
                    where: { isAvailable: true, stockOut: false },
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      name: true,
                      translations: true,
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
}

export type MenuCategoryRow = Awaited<ReturnType<typeof queryCategories>>[number];

export function cachedMenuCategories(tenantId: string): Promise<MenuCategoryRow[]> {
  return unstable_cache(() => queryCategories(tenantId), ["menu-categories", tenantId], { revalidate: MENU_CACHE_SECONDS, tags: [menuTag(tenantId)] })();
}

// Llamar DESPUÉS de cambiar la carta (en las rutas, dentro de after()).
// revalidateTag marca la entrada como caducada pero sirve una vez más la
// versión antigua mientras renueva («stale-while-revalidate»); por eso aquí
// mismo se hace esa lectura: la renovación arranca ya y el siguiente visitante
// ve el cambio. (updateTag solo funciona en Server Actions.)
export async function revalidateMenu(tenantId: string): Promise<void> {
  try {
    revalidateTag(menuTag(tenantId), "max");
    await cachedMenuCategories(tenantId);
  } catch (err) {
    // Fuera de una petición de Next (scripts, tests) no hay caché que invalidar.
    console.warn("[menuCache] no se pudo invalidar", err instanceof Error ? err.message : err);
  }
}
