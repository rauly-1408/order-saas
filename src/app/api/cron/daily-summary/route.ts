import { NextRequest, NextResponse } from "next/server";
import { sendDailySummaries } from "@/app/lib/notifyOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/cron/daily-summary → resumen del día anterior a cada restaurante.
// Lo llama el cron de Vercel (vercel.json) con «Authorization: Bearer CRON_SECRET».
// Sin CRON_SECRET definido no hace nada: así nadie puede dispararlo desde fuera.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no está definido" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const result = await sendDailySummaries();
  return NextResponse.json({ ok: true, ...result });
}
