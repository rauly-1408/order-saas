// Cifrado de credenciales de terceros (repartidor externo, pasarela de pago).
// AES-256-GCM con una clave derivada de SESSION_SECRET para cada uso, así no
// hace falta otra variable de entorno. Si se cambia SESSION_SECRET, el
// restaurante tiene que volver a pegar sus claves.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key(purpose: string): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET no está definido");
  if (secret.length < 32) throw new Error(`SESSION_SECRET es demasiado corto (${secret.length} caracteres, mínimo 32)`);
  return Buffer.from(hkdfSync("sha256", secret, "order-saas", purpose, 32));
}

export function seal(data: Record<string, string>, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function unseal(sealed: string | null | undefined, purpose: string): Record<string, string> {
  if (!sealed) return {};
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1") return {};
    const decipher = createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const json = Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
    const out = JSON.parse(json) as unknown;
    return out && typeof out === "object" ? (out as Record<string, string>) : {};
  } catch {
    return {};
  }
}
