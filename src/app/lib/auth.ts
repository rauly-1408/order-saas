import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { canManageTenant } from "@/app/lib/roles";
import { prisma } from "@/app/lib/prisma";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/app/lib/session";

// Helpers de sesión para el lado servidor (Node runtime).
// El middleware NO usa este módulo: usa session.ts directamente (edge-safe).

export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

// La firma del token no basta: se comprueba en la base de datos que el usuario
// sigue activo y se toman su rol y su local actuales. Así, desactivar a un
// empleado o cambiarle el permiso (Configuración → Usuarios) vale al momento.
async function fresh(payload: SessionPayload | null): Promise<SessionPayload | null> {
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { active: true, role: true, tenantId: true, storeId: true, email: true, seesTakings: true, passwordChangedAt: true } });
  if (!user || !user.active) return null;
  // Tras cambiar la contraseña, las sesiones abiertas antes (otros móviles) se cierran.
  if (user.passwordChangedAt && (payload.issuedAt ?? 0) < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;
  return { ...payload, email: user.email, role: user.role, tenantId: user.tenantId, storeId: user.storeId, seesTakings: user.role === "SUPERADMIN" || user.seesTakings };
}

// Para Server Components / Server Actions.
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return fresh(await verifySessionToken(token));
}

// Para Route Handlers (tienen acceso a req.cookies).
export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return fresh(await verifySessionToken(token));
}

export type { SessionPayload };

// Guard para Route Handlers de /api/admin/[tenant]/... (carta, personalización,
// configuración): exige sesión, que el usuario pertenezca a ese tenant (o sea
// SUPERADMIN) y que pueda gestionarlo (no STORE_MANAGER). Devuelve la respuesta
// de error a retornar, o null si tiene acceso.
export async function denyUnlessTenantAdmin(
  req: NextRequest,
  tenantId: string
): Promise<NextResponse | null> {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenantId) {
    return NextResponse.json({ error: "Prohibido" }, { status: 403 });
  }
  if (!canManageTenant(session.role)) {
    return NextResponse.json({ error: "Tu usuario solo puede gestionar pedidos" }, { status: 403 });
  }
  return null;
}

// Para páginas del panel reservadas a quien gestiona el restaurante. El layout
// (panel) ya garantiza sesión y tenant; aquí se filtra por rol.
export async function requireManagerPage(tenant: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect(`/admin/${tenant}/login`);
  if (!canManageTenant(session.role)) redirect(`/admin/${tenant}/pedidos`);
}
