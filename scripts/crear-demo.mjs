// Crea el restaurante de demostración «Demo NorApp» (slug «demo») para ver la
// versión NorApp del panel y enseñarla en las demos de venta. Lleva una carta
// de ejemplo y un usuario gerente. Se ejecuta en el Mac del dueño, contra la
// base de datos de su .env:
//   node --env-file=/ruta/al/.env scripts/crear-demo.mjs
// Se puede repetir: si la demo ya existe no borra nada, solo crea lo que falte.
// La contraseña se escribe sin que se vea y se guarda cifrada (scrypt, igual
// que src/app/lib/password.ts). Ver docs/MARCA-NORAPP.md
import { createInterface } from "node:readline";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const scryptAsync = promisify(scrypt);
const hash = async (pw) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(pw, salt, 64)).toString("hex")}`;
};

// Pregunta por la terminal; con `hidden`, lo que se escribe no se ve.
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? question : "");
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

const SLUG = "demo";
const DAY = [{ from: "09:00", to: "23:59" }]; // abierta todo el día: la demo siempre funciona
const HOURS = Object.fromEntries(["lun", "mar", "mie", "jue", "vie", "sab", "dom"].map((d) => [d, DAY]));

// Carta de ejemplo: lo justo para enseñar pedidos, mesas, cocina y barra.
const MENU = [
  ["Entrantes", [["Patatas bravas", 550, "Con alioli y salsa brava de la casa"], ["Croquetas de jamón (6)", 750, "Caseras, cremosas por dentro"], ["Ensalada de la huerta", 850, "Tomate, cebolla, pepino y aceite de oliva"]]],
  ["Principales", [["Hamburguesa de la casa", 1250, "Ternera, queso curado, cebolla caramelizada y patatas"], ["Pollo al limón", 1150, "Con arroz basmati y verduras salteadas"], ["Pasta boloñesa", 1050, "Salsa de carne cocinada a fuego lento"]]],
  ["Postres", [["Tarta de queso", 550, "Horneada, con base de galleta"], ["Coulant de chocolate", 600, "Con helado de vainilla"]]],
  ["Bebidas", [["Agua mineral", 200, "50 cl"], ["Refresco", 250, "Lata 33 cl"], ["Cerveza", 300, "Caña"], ["Café", 150, "Solo, cortado o con leche"]]],
];
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const prisma = new PrismaClient();
try {
  let tenant = await prisma.tenant.findUnique({ where: { slug: SLUG } });
  if (tenant) {
    console.log(`\n✓ La demo ya existe («${tenant.name}»). No se borra nada.`);
  } else {
    tenant = await prisma.tenant.create({
      data: {
        name: "Demo NorApp",
        slug: SLUG,
        branding: { primaryColor: "#1d1d1f", panel: { brand: "#1d1d1f", accent: "#e2382b", warm: "#f5f5f7" } },
        settings: { deliveryEnabled: false, takeawayEnabled: true, minimumOrderCents: 0, estimatedPickupMinutes: 15, currency: "EUR", address: "Calle Ejemplo, 1" },
      },
    });
    await prisma.store.create({ data: { tenantId: tenant.id, name: "Demo NorApp", deliveryEnabled: false, estimatedPickupMinutes: 15, openingHours: HOURS } });
    let n = 0;
    for (const [i, [name, products]] of MENU.entries()) {
      const cat = await prisma.category.create({ data: { tenantId: tenant.id, name, slug: slugify(name), sortOrder: i } });
      for (const [j, [pName, cents, description]] of products.entries()) {
        await prisma.product.create({ data: { tenantId: tenant.id, categoryId: cat.id, name: pName, slug: slugify(pName), description, basePriceCents: cents, sortOrder: j } });
        n++;
      }
    }
    console.log(`\n✓ Restaurante «Demo NorApp» creado con ${MENU.length} secciones y ${n} productos.`);
  }

  const admin = await prisma.user.findFirst({ where: { tenantId: tenant.id, role: "TENANT_ADMIN" }, select: { email: true } });
  if (admin) {
    console.log(`✓ Ya tiene gerente: ${admin.email}. Si olvidas su contraseña: scripts/cambiar-contrasena.mjs`);
  } else {
    const email = ((await ask("\nEmail del gerente de la demo (Enter = demo@norapp.app): ")) || "demo@norapp.app").toLowerCase();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new Error("Ese email ya tiene una cuenta. Usa otro.");
    const pw = await ask("Contraseña (mínimo 10 caracteres; no se verá al escribir): ", true);
    if (pw.length < 10) throw new Error("Demasiado corta: usa al menos 10 caracteres.");
    if ((await ask("Repítela: ", true)) !== pw) throw new Error("No coinciden. No se ha creado el usuario.");
    await prisma.user.create({ data: { email, password: await hash(pw), role: "TENANT_ADMIN", seesTakings: true, tenantId: tenant.id }, select: { id: true } });
    console.log(`✓ Gerente creado: ${email}`);
  }
  console.log("\nEntra en el panel: https://order-saas-delta.vercel.app/admin/demo/login");
  console.log("Carta pública:     https://order-saas-delta.vercel.app/pedir/demo\n");
} catch (e) {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
