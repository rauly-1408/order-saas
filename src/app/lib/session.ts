import { SignJWT, jwtVerify } from "jose";

// Firma/verificación del token de sesión. Sin imports de Next → compatible con
// edge (middleware) y con Node (rutas API). jose es edge-safe.

export const SESSION_COOKIE = "session";
const ALG = "HS256";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 días

export type SessionPayload = {
  userId: string;
  email: string;
  role: string;
  tenantId: string | null;
  storeId?: string | null; // rol «Pedidos» limitado a un local (se lee de la base de datos)
  seesTakings?: boolean; // ve lo recaudado (se lee de la base de datos)
  issuedAt?: number; // segundos (iat): las sesiones anteriores a un cambio de contraseña no valen
};

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET no está definido (o es demasiado corto). Añádelo a tu .env."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    email: payload.email,
    role: payload.role,
    tenantId: payload.tenantId,
  })
    .setProtectedHeader({ alg: ALG })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return {
      userId: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : "",
      role: typeof payload.role === "string" ? payload.role : "",
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
      issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
