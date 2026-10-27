import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { resetPassword } from "@/app/lib/passwordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { token, password } → pone la contraseña nueva con el enlace del email.
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "password-reset", 10, 900);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const error = await resetPassword(typeof body.token === "string" ? body.token : "", typeof body.password === "string" ? body.password : "");
  return error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true });
}
