import { NextRequest, NextResponse } from "next/server";
import { sendReminders } from "@/app/lib/reservationsDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/cron/reservas-recordatorio → email «te esperamos» a las reservas de
// hoy (con más de 2 h por delante) y de mañana. Cron de Vercel cada mañana
// (vercel.json) con «Authorization: Bearer CRON_SECRET». Ver docs/RESERVAS.md
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no está definido" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const sent = await sendReminders();
  return NextResponse.json({ ok: true, sent });
}
