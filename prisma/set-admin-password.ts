import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";
import readline from "node:readline";

// Cambia la contraseña de un usuario del panel.
// Uso:  npx ts-node prisma/set-admin-password.ts admin@estafeten.com
// La contraseña se pide por teclado (no queda en el historial de la terminal).
// Usa la DATABASE_URL del entorno (por defecto, la de .env).

const prisma = new PrismaClient();

// Mismo formato "<saltHex>:<hashHex>" que src/app/lib/password.ts (verifyPassword).
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

// Pide un valor sin mostrarlo en pantalla.
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(question);
    output._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

// Sin terminal interactiva (stdin por tubería): primera línea = contraseña,
// segunda = repetición.
async function readPasswords(): Promise<[string, string]> {
  if (process.stdin.isTTY) {
    const password = await askHidden("Nueva contraseña (mín. 10 caracteres): ");
    const repeat = await askHidden("Repite la contraseña: ");
    return [password, repeat];
  }
  const lines: string[] = [];
  for await (const line of readline.createInterface({ input: process.stdin })) lines.push(line);
  return [lines[0] ?? "", lines[1] ?? ""];
}

async function main() {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) throw new Error("Indica el email: npx ts-node prisma/set-admin-password.ts <email>");

  const host = new URL(process.env.DATABASE_URL ?? "").hostname;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No existe el usuario ${email} en ${host}`);

  console.log(`Cambiando la contraseña de ${email} en ${host}`);
  const [password, repeat] = await readPasswords();
  if (password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");
  if (password !== repeat) throw new Error("Las contraseñas no coinciden");

  await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(password) } });
  console.log("✅ Contraseña actualizada");
}

main()
  .catch((e) => {
    console.error("❌", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
