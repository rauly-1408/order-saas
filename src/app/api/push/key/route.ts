import { NextResponse } from "next/server";
import { vapidKeys } from "@/app/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → clave pública para que el navegador se apunte a los avisos (es pública por diseño).
export async function GET() {
  const { publicKey } = await vapidKeys();
  return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
