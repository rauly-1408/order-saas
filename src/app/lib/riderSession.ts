import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

const COOKIE = "rider_session";
const MAX_AGE = 60 * 60 * 12;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) throw new Error("SESSION_SECRET no está configurado");
  return new TextEncoder().encode(value);
}

export async function createRiderToken(riderId: string, tenantId: string, codeIssuedAt: number) {
  return new SignJWT({ tenantId, kind: "delivery-rider", codeIssuedAt })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(riderId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function readRiderToken(req: NextRequest): Promise<{ riderId: string; tenantId: string; codeIssuedAt: number } | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "delivery-rider" || typeof payload.sub !== "string" || typeof payload.tenantId !== "string" || typeof payload.codeIssuedAt !== "number") return null;
    return { riderId: payload.sub, tenantId: payload.tenantId, codeIssuedAt: payload.codeIssuedAt };
  } catch {
    return null;
  }
}

export function setRiderCookie(token: string) {
  return {
    name: COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: MAX_AGE,
  };
}

export function clearRiderCookie() {
  return { name: COOKIE, value: "", httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 0 };
}
