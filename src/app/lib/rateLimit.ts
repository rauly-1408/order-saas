import { NextRequest, NextResponse } from "next/server";

// Límite de peticiones por IP en las rutas públicas (pedidos, cupones,
// direcciones, login…). Con Upstash Redis (UPSTASH_REDIS_REST_URL/TOKEN) el
// contador es compartido entre todas las funciones de Vercel; sin esas
// variables se cuenta en memoria por instancia (protege menos, pero algo).
// Ventana fija: `limit` peticiones cada `windowSec` segundos. Ver docs/OPERACIONES.md

const memory = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") ?? "").trim() || "unknown";
}

async function hit(key: string, windowSec: number): Promise<{ count: number; resetAt: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const now = Date.now();
  if (url && token) {
    try {
      // INCR + EXPIRE (solo la primera vez) en una sola llamada.
      const res = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", key], ["EXPIRE", key, windowSec, "NX"], ["TTL", key]]),
        cache: "no-store",
      });
      if (res.ok) {
        const out = (await res.json()) as { result: number }[];
        const ttl = Number(out[2]?.result ?? windowSec);
        return { count: Number(out[0]?.result ?? 1), resetAt: now + Math.max(ttl, 1) * 1000 };
      }
    } catch (err) {
      console.error("[rateLimit] Upstash no responde; se cuenta en memoria", err instanceof Error ? err.message : err);
    }
  }
  const entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowSec * 1000 };
    memory.set(key, fresh);
    if (memory.size > 10_000) for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    return fresh;
  }
  entry.count++;
  return entry;
}

// Devuelve una respuesta 429 si la IP se ha pasado; null si puede seguir.
export async function rateLimit(req: NextRequest, name: string, limit: number, windowSec: number): Promise<NextResponse | null> {
  const { count, resetAt } = await hit(`rl:${name}:${clientIp(req)}`, windowSec);
  if (count <= limit) return null;
  const retry = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return NextResponse.json(
    { error: "Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo." },
    { status: 429, headers: { "Retry-After": String(retry), "Cache-Control": "no-store" } }
  );
}
