// Añade a la carta de Estafetén la sección "Entrantes y complementos" y el grupo
// opcional "Añade complementos" en cada mollete y burger. SOLO AÑADE: no borra
// nada y se puede ejecutar varias veces sin duplicar (seguro en producción).
// Uso: npx tsx prisma/add-complementos.ts   (usa DATABASE_URL del .env)
import { PrismaClient } from "@prisma/client";
import seed from "../src/app/data/seedMenu.estafeten.json";

const prisma = new PrismaClient();
const SLUG = "estafeten";
const CATEGORY = "entrantes-complementos";
const GROUP = "COMPLEMENTS";

async function main() {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true } });
  const catSeed = seed.categories.find((c) => c.slug === CATEGORY)!;
  const groupSeed = seed.modifierGroups.find((g) => g.code === GROUP)!;

  // 1) Categoría, justo antes de "Bebidas"
  let category = await prisma.category.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: CATEGORY } } });
  if (!category) {
    const bebidas = await prisma.category.findFirst({ where: { tenantId: tenant.id, slug: "bebidas" }, select: { sortOrder: true } });
    const order = bebidas?.sortOrder ?? catSeed.sortOrder;
    await prisma.category.updateMany({ where: { tenantId: tenant.id, sortOrder: { gte: order }, NOT: { slug: "menus" } }, data: { sortOrder: { increment: 1 } } });
    category = await prisma.category.create({ data: { tenantId: tenant.id, name: catSeed.name, slug: CATEGORY, sortOrder: order } });
    console.log("✓ Categoría creada:", category.name);
  } else console.log("· La categoría ya existía");

  // 2) Productos de la sección
  let created = 0;
  for (const p of seed.products.filter((x) => x.categorySlug === CATEGORY)) {
    const exists = await prisma.product.findUnique({ where: { tenantId_slug: { tenantId: tenant.id, slug: p.slug } }, select: { id: true } });
    if (exists) continue;
    await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: p.name, slug: p.slug, description: p.description, basePriceCents: p.basePriceCents, sortOrder: p.sortOrder },
    });
    created++;
  }
  console.log(`✓ Productos nuevos: ${created}`);

  // 3) Grupo opcional "Añade complementos" con sus opciones
  let group = await prisma.modifierGroup.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: GROUP } } });
  if (!group) {
    group = await prisma.modifierGroup.create({
      data: {
        tenantId: tenant.id,
        code: GROUP,
        name: groupSeed.name,
        isRequired: false,
        minSelect: 0,
        maxSelect: groupSeed.maxSelect,
        options: { create: groupSeed.options.map((o) => ({ name: o.name, priceDeltaCents: o.priceDeltaCents, sortOrder: o.sortOrder })) },
      },
    });
    console.log("✓ Grupo creado:", group.name);
  } else console.log("· El grupo ya existía");

  // 4) En cada mollete y burger (los que tienen "Elige tu pan"), detrás de sus grupos
  const withBread = await prisma.product.findMany({
    where: { tenantId: tenant.id, modifierGroups: { some: { group: { code: "BREAD" } } } },
    select: { id: true, modifierGroups: { select: { groupId: true, sortOrder: true } } },
  });
  let linked = 0;
  for (const p of withBread) {
    if (p.modifierGroups.some((m) => m.groupId === group!.id)) continue;
    const next = Math.max(0, ...p.modifierGroups.map((m) => m.sortOrder)) + 1;
    await prisma.productModifierGroup.create({ data: { productId: p.id, groupId: group.id, sortOrder: next } });
    await prisma.product.update({ where: { id: p.id }, data: { hasModifiers: true } });
    linked++;
  }
  console.log(`✓ Complementos añadidos a ${linked} molletes y burgers`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
