// «¿Has olvidado tu contraseña?»: enlaces de un solo uso que llegan por email.
// En la base de datos solo se guarda el hash del token, así que una copia de la
// base no sirve para entrar. Caduca en 1 hora. Ver docs/OPERACIONES.md
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/prisma";
import { hashPassword } from "@/app/lib/password";

export const RESET_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD = 10;

const sha256 = (t: string) => createHash("sha256").update(t).digest("hex");

// Crea un enlace nuevo (los anteriores sin usar de ese usuario dejan de valer).
export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.passwordReset.deleteMany({ where: { userId, usedAt: null } }),
    prisma.passwordReset.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
  ]);
  return token;
}

// ¿Sirve todavía el enlace? (para enseñar el formulario o el aviso de caducado)
export async function resetTokenValid(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const r = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, select: { usedAt: true, expiresAt: true } });
  return !!r && !r.usedAt && r.expiresAt > new Date();
}

// Pone la contraseña nueva y gasta el enlace. Devuelve el error a enseñar o null.
export async function resetPassword(token: string, password: string): Promise<string | null> {
  if (typeof password !== "string" || password.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`;
  if (password.length > 200) return "La contraseña es demasiado larga";
  if (!token || token.length > 100) return "El enlace no es válido";
  const now = new Date();
  // Se marca como usado de forma atómica: dos envíos a la vez no lo usan dos veces.
  const claimed = await prisma.passwordReset.updateMany({ where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  if (!claimed.count) return "El enlace ha caducado o ya se ha usado. Pide otro.";
  const r = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) }, select: { userId: true } });
  if (!r) return "El enlace no es válido";
  await prisma.user.update({ where: { id: r.userId }, data: { password: await hashPassword(password), passwordChangedAt: now, active: true } });
  await prisma.passwordReset.deleteMany({ where: { userId: r.userId, usedAt: null } });
  return null;
}
