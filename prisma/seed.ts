import { PrismaClient, Prisma, Channel } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

// Helper: fuerza a Prisma JSON type (evita errores TS2322)
const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

// Tipos mínimos (sin `any`) y alineados con Prisma
type SeedModifierOption = {
  name: string;
  priceDeltaCents?: number;
  sortOrder?: number;
};

type SeedModifierGroup = {
  code: string;
  name: string;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number;
  options?: SeedModifierOption[];
};

type SeedCategory = {
  name: string;
  slug: string;
  sortOrder?: number;
  isFeatured?: boolean;
};

type SeedProduct = {
  categorySlug: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string | null;
  basePriceCents?: number;
  tags?: string[];
  activeChannels?: Channel[];
  modifierGroupCodes?: string[];
};

type SeedJson = {
  tenant: {
    name: string;
    slug: string;
    branding?: Prisma.InputJsonValue;
    settings?: Prisma.InputJsonValue;
    domains?: string[];
  };
  store: {
    name: string;
    address: string;
    city: string;
    postalCode: string;
    hours?: Prisma.InputJsonValue;
    channels?: Prisma.InputJsonValue;
    deliveryZones?: Prisma.InputJsonValue;
  };
  modifierGroups?: SeedModifierGroup[];
  categories?: SeedCategory[];
  products?: SeedProduct[];
};

async function main() {
  console.log("🌱 Iniciando seed Estafeten...");

  const filePath = path.join(process.cwd(), "src/data/seedMenu.estafeten.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo de seed en: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const seed: SeedJson = JSON.parse(raw);

  // 1) Tenant (upsert)
  const tenant = await prisma.tenant.upsert({
    where: { slug: seed.tenant.slug },
    update: {
      name: seed.tenant.name,
      branding: asJson(seed.tenant.branding ?? {}),
      settings: asJson(seed.tenant.settings ?? {}),
      domains: seed.tenant.domains ?? [],
    },
    create: {
      name: seed.tenant.name,
      slug: seed.tenant.slug,
      branding: asJson(seed.tenant.branding ?? {}),
      settings: asJson(seed.tenant.settings ?? {}),
      domains: seed.tenant.domains ?? [],
    },
  });

  console.log(`✅ Tenant creado: ${tenant.name}`);

  // 2) Limpieza (para poder re-ejecutar sin choques)
  await prisma.orderItem.deleteMany({ where: { order: { tenantId: tenant.id } } });
  await prisma.order.deleteMany({ where: { tenantId: tenant.id } });

  await prisma.productModifierGroup.deleteMany({ where: { product: { tenantId: tenant.id } } });
  await prisma.product.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.category.deleteMany({ where: { tenantId: tenant.id } });

  await prisma.modifierOption.deleteMany({ where: { group: { tenantId: tenant.id } } });
  await prisma.modifierGroup.deleteMany({ where: { tenantId: tenant.id } });

  await prisma.store.deleteMany({ where: { tenantId: tenant.id } });

  // 3) Store
  const store = await prisma.store.create({
    data: {
      tenantId: tenant.id,
      name: seed.store.name,
      address: seed.store.address,
      city: seed.store.city,
      postalCode: seed.store.postalCode,
      hours: asJson(seed.store.hours ?? {}),
      channels: asJson(seed.store.channels ?? {}),
      deliveryZones: asJson(seed.store.deliveryZones ?? []),
    },
  });

  console.log(`✅ Store creada: ${store.name}`);

  // 4) Modificadores
  const groupMap = new Map<string, string>(); // code -> groupId

  for (const g of seed.modifierGroups ?? []) {
    const group = await prisma.modifierGroup.create({
      data: {
        tenantId: tenant.id,
        name: g.name,
        code: g.code,
        isRequired: !!g.isRequired,
        minSelect: g.minSelect ?? 0,
        maxSelect: g.maxSelect ?? 1,
        options: {
          create: (g.options ?? []).map((o: SeedModifierOption) => ({
            name: o.name,
            priceDeltaCents: o.priceDeltaCents ?? 0,
            sortOrder: o.sortOrder ?? 0,
          })),
        },
      },
    });
    groupMap.set(g.code, group.id);
  }

  // 5) Categorías
  const catMap = new Map<string, string>(); // slug -> categoryId

  for (const c of seed.categories ?? []) {
    const cat = await prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder ?? 0,
        isFeatured: !!c.isFeatured,
      },
    });
    catMap.set(c.slug, cat.id);
  }

  // 6) Productos (desde seed.products con categorySlug)
  let createdProducts = 0;

  for (const p of seed.products ?? []) {
    const categoryId = catMap.get(p.categorySlug);
    if (!categoryId) {
      console.warn(`⚠️ Producto ignorado: no existe categorySlug "${p.categorySlug}" (${p.name})`);
      continue;
    }

    const prod = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId,
        name: p.name,
        slug: p.slug,
        description: p.description ?? "",
        imageUrl: p.imageUrl ?? null,
        basePriceCents: p.basePriceCents ?? 0,
        tags: p.tags ?? [],
        isActive: true,
        activeChannels: p.activeChannels ?? [Channel.DELIVERY, Channel.TAKEAWAY],
      },
    });

    createdProducts++;

    const codes: string[] = p.modifierGroupCodes ?? [];
    for (let i = 0; i < codes.length; i++) {
      const gid = groupMap.get(codes[i]);
      if (!gid) continue;
      await prisma.productModifierGroup.create({
        data: { productId: prod.id, groupId: gid, sortOrder: i },
      });
    }
  }

  console.log(`✅ Categorías creadas: ${catMap.size}`);
  console.log(`✅ Productos creados: ${createdProducts}`);
  console.log("🎉 Seed completado con éxito");
}

main()
  .catch((e) => {
    console.error("❌ Seed falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  