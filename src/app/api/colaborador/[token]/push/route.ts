import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { rateLimit } from "@/app/lib/rateLimit";
import { parseSubscription, saveSubscription } from "@/app/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tokenOf = (req: NextRequest) => new URL(req.url).pathname.split("/").at(-2) ?? "";

// POST { subscription } → el móvil del colaborador recibe un aviso con cada venta.
// El enlace secreto es la llave, como en el resto de su app.
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "colaborador-push", 10, 60);
  if (limited) return limited;
  const c = await prisma.collaborator.findUnique({ where: { token: tokenOf(req) }, select: { id: true, tenantId: true, active: true } });
  if (!c?.active) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { subscription?: unknown } | null;
  const sub = parseSubscription(b?.subscription);
  if (!sub) return NextResponse.json({ error: "Suscripción no válida" }, { status: 400 });
  await saveSubscription(sub, { tenantId: c.tenantId, audience: "COLLABORATOR", collaboratorId: c.id });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const c = await prisma.collaborator.findUnique({ where: { token: tokenOf(req) }, select: { id: true } });
  if (!c) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  const b = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof b?.endpoint === "string") await prisma.pushSubscription.deleteMany({ where: { endpoint: b.endpoint, collaboratorId: c.id } });
  return NextResponse.json({ ok: true });
}
