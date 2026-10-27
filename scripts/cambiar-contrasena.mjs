// Pone una contraseña nueva a un usuario del panel (por si se olvida).
// Se ejecuta en el Mac del dueño, contra la base de datos de su .env:
//   node --env-file=/ruta/al/.env scripts/cambiar-contrasena.mjs
// La contraseña se escribe sin que se vea y se guarda cifrada (scrypt, igual
// que src/app/lib/password.ts). Ver docs/OPERACIONES.md
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

const prisma = new PrismaClient();
try {
  const admins = await prisma.user.findMany({ where: { role: { in: ["TENANT_ADMIN", "SUPERADMIN"] }, active: true }, select: { email: true, tenant: { select: { name: true } } }, orderBy: { email: "asc" } });
  console.log("\nUsuarios administradores:");
  for (const a of admins) console.log(`  · ${a.email}${a.tenant ? ` (${a.tenant.name})` : ""}`);
  const email = (await ask("\nEmail del usuario: ")).toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error("No hay ningún usuario con ese email.");
  const pw = await ask("Contraseña nueva (mínimo 10 caracteres; no se verá al escribir): ", true);
  if (pw.length < 10) throw new Error("Demasiado corta: usa al menos 10 caracteres.");
  if ((await ask("Repítela: ", true)) !== pw) throw new Error("No coinciden. No se ha cambiado nada.");
  // passwordChangedAt cierra las sesiones abiertas antes en otros dispositivos.
  await prisma.user.update({ where: { id: user.id }, data: { password: await hash(pw), active: true, passwordChangedAt: new Date() }, select: { id: true } });
  console.log("\n✓ Contraseña cambiada. Ya puedes entrar en el panel con ella.\n");
} catch (e) {
  console.error(`\n✗ ${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
