import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// scrypt nativo de Node: sin dependencias externas y resistente a fuerza bruta.
// Formato almacenado: "<saltHex>:<hashHex>".
// Solo se usa en runtime Node (rutas API y seed), nunca en edge.

const scryptAsync = promisify(scrypt);
const KEY_LEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;

  const keyBuf = Buffer.from(key, "hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;

  // Comparación en tiempo constante para evitar timing attacks.
  if (keyBuf.length !== derived.length) return false;
  return timingSafeEqual(keyBuf, derived);
}
