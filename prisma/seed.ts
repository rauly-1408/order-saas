import { PrismaClient, Prisma, Channel } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { scryptSync, randomBytes } from "node:crypto";

const prisma = new PrismaClient();

// Hash de contraseña con scrypt (inline para evitar problemas de resolución de
// módulos ESM en el seed). Mismo formato "<saltHex>:<hashHex>" que
// src/app/lib/password.ts — compatible con verifyPassword().
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

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
  description?: string;
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
  sortOrder?: number;
  // Opción preseleccionada por grupo: { "BREAD": "Tradicional" }
  defaults?: Record<string, string>;
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

  const filePath = path.join(process.cwd(), "src/app/data/seedMenu.estafeten.json");
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

  // Usuario admin del tenant (para acceder al panel). Password hasheado con scrypt.
  // Configurable con SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD; cámbialo tras el primer login.
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@estafeten.com").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";
  const passwordHash = hashPassword(adminPassword);
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { password: passwordHash, role: "TENANT_ADMIN", tenantId: tenant.id },
    create: {
      email: adminEmail,
      password: passwordHash,
      role: "TENANT_ADMIN",
      tenantId: tenant.id,
    },
  });
  console.log(`✅ Usuario admin: ${adminEmail}`);

  // 2) Limpieza (para poder re-ejecutar sin choques)
  await prisma.orderLine.deleteMany({ where: { order: { tenantId: tenant.id } } });
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
      openingHours: asJson(seed.store.hours ?? {}),
    },
  });

  console.log(`✅ Store creada: ${store.name}`);

  // 4) Modificadores
  const groupMap = new Map<string, string>(); // code -> groupId
  const optionMap = new Map<string, string>(); // "CODE::Nombre opción" -> optionId

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
      include: { options: true },
    });
    groupMap.set(g.code, group.id);
    for (const o of group.options) optionMap.set(`${g.code}::${o.name}`, o.id);
  }

  // 5) Categorías
  const catMap = new Map<string, string>(); // slug -> categoryId

  for (const c of seed.categories ?? []) {
    const cat = await prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: c.name,
        slug: c.slug,
        description: c.description ?? null,
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
        sortOrder: p.sortOrder ?? 0,
        hasModifiers: (p.modifierGroupCodes ?? []).length > 0,
        isActive: true,
      },
    });

    createdProducts++;

    const codes: string[] = p.modifierGroupCodes ?? [];
    for (let i = 0; i < codes.length; i++) {
      const gid = groupMap.get(codes[i]);
      if (!gid) continue;
      const defaultName = p.defaults?.[codes[i]];
      const defaultOptionId = defaultName ? optionMap.get(`${codes[i]}::${defaultName}`) : undefined;
      if (defaultName && !defaultOptionId) {
        console.warn(`⚠️ ${p.name}: no existe la opción "${defaultName}" en ${codes[i]}`);
      }
      await prisma.productModifierGroup.create({
        data: { productId: prod.id, groupId: gid, sortOrder: i, defaultOptionId: defaultOptionId ?? null },
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
  
