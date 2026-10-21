// Prueba de que el teléfono es de quien pide: al crear un pedido se deja una
// cookie firmada (HMAC con SESSION_SECRET) ligada a restaurante + teléfono.
// Con ella, el checkout enseña los sellos de la tarjeta y se canjea el premio.
// Sin ella (otro dispositivo, o alguien que solo sabe el número) no se revela
// nada del cliente ni se gasta su premio. Ver docs/PROMOCIONES-Y-FIDELIZACION.md
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { normalizePhone } from "@/app/lib/retention";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function proofCookieName(tenantId: string): string {
  return `cp_${tenantId}`;
}

function sign(tenantId: string, phone: string): string | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) return null;
  return createHmac("sha256", secret).update(`customer-proof:${tenantId}:${normalizePhone(phone)}`).digest("base64url");
}

// ¿La petición trae la cookie de ese teléfono en ese restaurante?
export function customerProven(req: NextRequest, tenantId: string, phone: string): boolean {
  const expected = sign(tenantId, phone);
  const got = req.cookies.get(proofCookieName(tenantId))?.value;
  if (!expected || !got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

// Deja la cookie en la respuesta del pedido (un año, solo http, mismo sitio).
export function withCustomerProof<T extends NextResponse>(res: T, tenantId: string, phone: string): T {
  const value = sign(tenantId, phone);
  if (value) {
    res.cookies.set(proofCookieName(tenantId), value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ONE_YEAR });
  }
  return res;
}
