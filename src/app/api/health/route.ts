import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health → ¿responde la app y la base de datos? Para el vigilante de
// disponibilidad (UptimeRobot u otro): 200 si todo va, 503 si la base no
// contesta en 5 s. No expone nada del negocio. Ver docs/OPERACIONES.md
export async function GET() {
  const started = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
    ]);
    return NextResponse.json({ ok: true, db: "ok", ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[health] base de datos sin respuesta", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, db: "down", ms: Date.now() - started }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
