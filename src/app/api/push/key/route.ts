import { NextResponse } from "next/server";
import { vapidKeys } from "@/app/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → clave pública para que el navegador se apunte a los avisos (es pública por diseño).
// Si no se pueden preparar las claves, dice por qué (sin datos secretos) para
// poder arreglarlo sin acceso a los registros del servidor.
export async function GET() {
  try {
    const { publicKey } = await vapidKeys();
    return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[push/key]", msg);
    const reason = /SESSION_SECRET/.test(msg) ? "session-secret" : /does not exist|no existe|P2021/i.test(msg) ? "tabla" : "otro";
    return NextResponse.json({ error: "No se pudieron preparar los avisos", reason, detail: msg.replace(/[A-Za-z0-9_-]{40,}/g, "…").slice(0, 160) }, { status: 500 });
  }
}
