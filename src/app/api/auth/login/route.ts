import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { verifyPassword } from "@/app/lib/password";
import { setSessionCookie } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LoginBody = {
  email?: string;
  password?: string;
  tenant?: string; // slug del tenant desde el que se hace login
};

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "login", 10, 900);
  if (limited) return limited;
  try {
    const { email, password, tenant: tenantSlug }: LoginBody = await req.json();

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Faltan credenciales" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    // Mensaje genérico: no revelamos si el email existe o no.
    const invalid = NextResponse.json(
      { error: "Email o contraseña incorrectos" },
      { status: 401 }
    );

    if (!user) return invalid;

    const ok = await verifyPassword(password, user.password);
    if (!ok) return invalid;
    if (!user.active) return NextResponse.json({ error: "Tu usuario está desactivado. Habla con el responsable del restaurante." }, { status: 403 });

    // Scoping de tenant: un TENANT_ADMIN solo entra en su propio tenant.
    if (user.role !== "SUPERADMIN" && tenantSlug) {
      const tenant = await prisma.tenant.findUnique({
        where: { slug: tenantSlug },
        select: { id: true },
      });
      if (!tenant || user.tenantId !== tenant.id) {
        return NextResponse.json(
          { error: "No tienes acceso a este negocio" },
          { status: 403 }
        );
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await setSessionCookie({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });

    return NextResponse.json({ ok: true, role: user.role });
  } catch (err) {
    console.error("[POST /api/auth/login]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
