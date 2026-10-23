import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { hashPassword } from "@/app/lib/password";
import { emailConfigured, sendEmail, tempPasswordEmail } from "@/app/lib/email";

// Envía la contraseña temporal al email del usuario (si hay servicio de email).
async function mailPassword(req: NextRequest, tenantId: string, email: string, password: string, reset: boolean): Promise<boolean> {
  if (!emailConfigured()) return false;
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true, name: true } });
  if (!t) return false;
  return sendEmail({ to: email, ...tempPasswordEmail({ restaurant: t.name, email, password, loginUrl: `${new URL(req.url).origin}/admin/${t.slug}/login`, reset }) });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Usuarios y permisos. Dos permisos:
//   TENANT_ADMIN  «Gerente»: todo el restaurante.
//   STORE_MANAGER «Pedidos»: solo Pedidos (y, si se elige, de un solo local).
// La contraseña inicial la genera el panel y se enseña una sola vez.
const ROLES = ["TENANT_ADMIN", "STORE_MANAGER"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  const session = (await getSessionFromRequest(req))!;
  return { tenantId: tenant.id, me: session.userId };
}

// Contraseña temporal legible: 3 bloques de 4 (sin letras que se confunden).
function tempPassword(): string {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => a[randomInt(a.length)]).join("")).join("-");
}

async function list(tenantId: string, me: string) {
  const users = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, email: true, name: true, role: true, active: true, storeId: true, seesTakings: true, lastLoginAt: true },
  });
  return users.map((u) => ({ ...u, me: u.id === me }));
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const stores = await prisma.store.findMany({ where: { tenantId: c.tenantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } });
  return NextResponse.json({ users: await list(c.tenantId, c.me), stores });
}

// POST { email, name, role, storeId } → crea el usuario y devuelve su contraseña temporal.
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Email no válido" }, { status: 400 });
  const role = ROLES.includes(b.role as (typeof ROLES)[number]) ? (b.role as (typeof ROLES)[number]) : "STORE_MANAGER";
  const storeId = role === "STORE_MANAGER" && typeof b.storeId === "string" && b.storeId ? b.storeId : null;
  if (storeId && !(await prisma.store.findFirst({ where: { id: storeId, tenantId: c.tenantId } }))) return NextResponse.json({ error: "Local no válido" }, { status: 400 });
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: "Ese email ya tiene una cuenta" }, { status: 400 });
  const password = tempPassword();
  await prisma.user.create({
    data: { email, name: typeof b.name === "string" ? b.name.trim().slice(0, 80) || null : null, role, storeId, tenantId: c.tenantId, password: await hashPassword(password) },
  });
  const emailed = await mailPassword(req, c.tenantId, email, password, false);
  return NextResponse.json({ users: await list(c.tenantId, c.me), password, emailed });
}

// PATCH { id, role?, storeId?, active?, name?, seesTakings?, resetPassword? }
export async function PATCH(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const user = typeof b.id === "string" ? await prisma.user.findFirst({ where: { id: b.id, tenantId: c.tenantId } }) : null;
  if (!user) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  const role = b.role !== undefined ? (ROLES.includes(b.role as (typeof ROLES)[number]) ? (b.role as (typeof ROLES)[number]) : null) : user.role;
  if (!role) return NextResponse.json({ error: "Permiso no válido" }, { status: 400 });
  const active = typeof b.active === "boolean" ? b.active : user.active;
  if (user.id === c.me && (!active || role !== user.role)) return NextResponse.json({ error: "No puedes quitarte el acceso ni cambiar tu propio permiso" }, { status: 400 });
  // Siempre tiene que quedar un gerente activo.
  if (user.role === "TENANT_ADMIN" && user.active && (role !== "TENANT_ADMIN" || !active)) {
    const admins = await prisma.user.count({ where: { tenantId: c.tenantId, role: "TENANT_ADMIN", active: true } });
    if (admins <= 1) return NextResponse.json({ error: "Tiene que quedar al menos un gerente" }, { status: 400 });
  }
  let storeId = b.storeId !== undefined ? (typeof b.storeId === "string" && b.storeId ? b.storeId : null) : user.storeId;
  if (role !== "STORE_MANAGER") storeId = null;
  if (storeId && !(await prisma.store.findFirst({ where: { id: storeId, tenantId: c.tenantId } }))) return NextResponse.json({ error: "Local no válido" }, { status: 400 });

  const password = b.resetPassword === true ? tempPassword() : null;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      role,
      active,
      storeId,
      ...(typeof b.seesTakings === "boolean" && { seesTakings: b.seesTakings }),
      ...(typeof b.name === "string" && { name: b.name.trim().slice(0, 80) || null }),
      ...(password && { password: await hashPassword(password) }),
    },
  });
  const emailed = password ? await mailPassword(req, c.tenantId, user.email, password, true) : false;
  return NextResponse.json({ users: await list(c.tenantId, c.me), ...(password && { password, emailed }) });
}
