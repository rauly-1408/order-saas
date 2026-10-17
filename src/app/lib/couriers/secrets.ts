// Cifrado de los secretos del repartidor externo (clave privada de Glovo,
// secreto del webhook). AES-256-GCM con una clave derivada de SESSION_SECRET,
// así no hace falta otra variable de entorno. Si se cambia SESSION_SECRET, el
// restaurante tiene que volver a generar las claves en el panel.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET no está definido");
  return Buffer.from(hkdfSync("sha256", secret, "order-saas", "courier-secrets-v1", 32));
}

export function sealSecrets(data: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(".");
}

export function openSecrets(sealed: string | null | undefined): Record<string, string> {
  if (!sealed) return {};
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1") return {};
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const json = Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
    const out = JSON.parse(json) as unknown;
    return out && typeof out === "object" ? (out as Record<string, string>) : {};
  } catch {
    return {};
  }
}
