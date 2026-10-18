import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { hashPassword, verifyPassword } from "@/app/lib/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT { current, next } → cambiar mi contraseña (cualquier usuario del panel).
export async function PUT(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { current, next } = (await req.json().catch(() => ({}))) as { current?: string; next?: string };
  if (typeof next !== "string" || next.length < 10) return NextResponse.json({ error: "La nueva contraseña necesita al menos 10 caracteres" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || typeof current !== "string" || !(await verifyPassword(current, user.password))) {
    return NextResponse.json({ error: "La contraseña actual no es correcta" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: user.id }, data: { password: await hashPassword(next) } });
  return NextResponse.json({ ok: true });
}
