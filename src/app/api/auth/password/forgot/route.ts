import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { emailConfigured, passwordResetEmail, sendEmail } from "@/app/lib/email";
import { createResetToken } from "@/app/lib/passwordReset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { email, tenant } → si el email es de un usuario de ese restaurante, le
// llega un enlace para poner una contraseña nueva. La respuesta es la misma
// exista o no, para no revelar qué emails tienen cuenta.
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "password-forgot", 5, 900);
  if (limited) return limited;
  // Sin servicio de email no hay forma segura de recuperarla: se dice claro.
  if (!emailConfigured()) return NextResponse.json({ ok: false, noEmail: true });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; tenant?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const slug = typeof body.tenant === "string" ? body.tenant : "";
  if (!email || !slug) return NextResponse.json({ error: "Escribe tu email" }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  const user = tenant ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, active: true, role: true, tenantId: true } }) : null;
  if (tenant && user && user.active && (user.role === "SUPERADMIN" || user.tenantId === tenant.id)) {
    const token = await createResetToken(user.id);
    const resetUrl = `${new URL(req.url).origin}/admin/${tenant.slug}/restablecer?t=${token}`;
    await sendEmail({ to: user.email, ...passwordResetEmail({ restaurant: tenant.name, resetUrl }) });
  }
  return NextResponse.json({ ok: true });
}
