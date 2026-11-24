import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { sendPending } from "@/app/lib/aeatSend";
import { ctx, payload } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST → «Enviar ahora»: manda a la AEAT lo pendiente (si la AEAT pide esperar,
// dice hasta cuándo).
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const limited = await rateLimit(req, "aeat-send", 20, 600);
  if (limited) return limited;
  const outcome = await sendPending(c.tenant.id);
  return NextResponse.json({ ...(await payload(c.tenant.id, c.tenant.settings, c.sees)), outcome });
}
