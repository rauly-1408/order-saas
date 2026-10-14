import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { canManageTenant } from "@/app/lib/roles";
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

// Para Server Components / Server Actions.
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Para Route Handlers (tienen acceso a req.cookies).
export async function getSessionFromRequest(
  req: NextRequest
): Promise<SessionPayload | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
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
