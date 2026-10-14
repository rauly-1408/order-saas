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

// El seed REEMPLAZA la carta (categorías, productos, modificadores). En una base
// remota (Neon = producción) exige SEED_ALLOW_REMOTE=1 para evitar accidentes.
function assertSafeTarget(): { remote: boolean } {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL no es una URL válida");
  }
  const remote = !["localhost", "127.0.0.1", "::1"].includes(host);
  if (remote && process.env.SEED_ALLOW_REMOTE !== "1") {
    throw new Error(
      `Seed bloqueado: DATABASE_URL apunta a "${host}" (no es local). ` +
        "Si de verdad quieres reemplazar la carta ahí, ejecuta con SEED_ALLOW_REMOTE=1."
    );
  }
  return { remote };
}

async function main() {
  const { remote } = assertSafeTarget();
  console.log(`🌱 Iniciando seed Estafeten${remote ? " (BASE REMOTA)" : ""}...`);

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

  // Usuario admin del tenant. Solo se CREA si no existe: nunca se sobrescribe la
  // contraseña de un usuario existente. En remoto exige SEED_ADMIN_PASSWORD.
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@estafeten.com").toLowerCase();
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });
  if (existingAdmin) {
    console.log(`✅ Usuario admin ya existe: ${adminEmail} (contraseña sin cambios)`);
  } else if (remote && !process.env.SEED_ADMIN_PASSWORD) {
    console.warn(`⚠️ Usuario admin NO creado: en remoto define SEED_ADMIN_PASSWORD`);
  } else {
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "changeme123"),
        role: "TENANT_ADMIN",
        tenantId: tenant.id,
      },
    });
    console.log(`✅ Usuario admin creado: ${adminEmail}`);
  }

  // Usuario encargado de tienda (STORE_MANAGER) para probar permisos. SOLO en
  // bases locales: en producción el equipo se gestiona desde el panel.
  if (!remote) {
    const managerEmail = "encargado@estafeten.com";
    const existingManager = await prisma.user.findUnique({ where: { email: managerEmail }, select: { id: true } });
    if (!existingManager) {
      await prisma.user.create({
        data: {
          email: managerEmail,
          password: hashPassword(process.env.SEED_ADMIN_PASSWORD ?? "changeme123"),
          role: "STORE_MANAGER",
          tenantId: tenant.id,
        },
      });
      console.log(`✅ Usuario encargado creado: ${managerEmail} (solo local)`);
    }
  }

  // Módulo Costes activado en local para poder desarrollarlo y probarlo.
  // En producción los módulos se contratan aparte (nunca desde el seed).
  if (!remote && !tenant.addons.includes("COSTS")) {
    await prisma.tenant.update({ where: { id: tenant.id }, data: { addons: { push: "COSTS" } } });
    console.log("✅ Módulo Costes activado (solo local)");
  }

  // ⚠️ Recargar la carta borra productos y opciones y, en cascada, sus escandallos.

  // 2) Limpieza de la carta (para poder re-ejecutar sin choques).
  // Los pedidos NO se tocan: sus líneas guardan nombre, precio y opciones como
  // snapshot, así que no dependen de que el producto siga existiendo.
  await prisma.productModifierGroup.deleteMany({ where: { product: { tenantId: tenant.id } } });
  await prisma.product.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.category.deleteMany({ where: { tenantId: tenant.id } });

  await prisma.modifierOption.deleteMany({ where: { group: { tenantId: tenant.id } } });
  await prisma.modifierGroup.deleteMany({ where: { tenantId: tenant.id } });

  // 3) Store: se actualiza si existe (los pedidos la referencian, no se puede borrar).
  const storeData = {
    name: seed.store.name,
    address: seed.store.address,
    openingHours: asJson(seed.store.hours ?? {}),
  };
  const existingStore = await prisma.store.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  const store = existingStore
    ? await prisma.store.update({ where: { id: existingStore.id }, data: storeData })
    : await prisma.store.create({ data: { tenantId: tenant.id, ...storeData } });

  console.log(`✅ Store ${existingStore ? "actualizada" : "creada"}: ${store.name}`);

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
  
