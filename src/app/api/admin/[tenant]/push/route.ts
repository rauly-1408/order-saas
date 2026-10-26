import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { parseSubscription, saveSubscription } from "@/app/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenantOf(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  return denied ? { error: denied } : { tenant };
}

// POST { subscription } → este dispositivo recibe los avisos del panel (stock bajo).
export async function POST(req: NextRequest) {
  const ctx = await tenantOf(req);
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as { subscription?: unknown } | null;
  const sub = parseSubscription(b?.subscription);
  if (!sub) return NextResponse.json({ error: "Suscripción no válida" }, { status: 400 });
  const session = await getSessionFromRequest(req);
  await saveSubscription(sub, { tenantId: ctx.tenant.id, audience: "PANEL", userId: session?.userId ?? null });
  return NextResponse.json({ ok: true });
}

// DELETE { endpoint } → deja de recibirlos en este dispositivo.
export async function DELETE(req: NextRequest) {
  const ctx = await tenantOf(req);
  if ("error" in ctx) return ctx.error;
  const b = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof b?.endpoint === "string") await prisma.pushSubscription.deleteMany({ where: { endpoint: b.endpoint, tenantId: ctx.tenant.id } });
  return NextResponse.json({ ok: true });
}
