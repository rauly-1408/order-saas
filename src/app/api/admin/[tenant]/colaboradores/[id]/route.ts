import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { newCollabToken, parseCollaborator } from "@/app/lib/collaborators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH → cambiar datos, activar/desactivar o { newLink: true } (enlace privado
// nuevo si el anterior se ha compartido de más). DELETE → borrar (si no tiene
// pedidos; si los tiene, se desactiva). Ver docs/COLABORADORES.md

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const id = parts.at(-1) ?? "";
  const slug = parts.at(-3) ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  const c = await prisma.collaborator.findFirst({ where: { id, tenantId: tenant.id }, select: { id: true } });
  if (!c) return { error: NextResponse.json({ error: "Colaborador no encontrado" }, { status: 404 }) };
  return { tenantId: tenant.id, id };
}

export async function PATCH(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (b.newLink === true) {
    await prisma.collaborator.update({ where: { id: c.id }, data: { token: newCollabToken() } });
    return NextResponse.json({ ok: true });
  }
  if (typeof b.active === "boolean" && Object.keys(b).length === 1) {
    await prisma.collaborator.update({ where: { id: c.id }, data: { active: b.active } });
    return NextResponse.json({ ok: true });
  }
  const input = parseCollaborator(b);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const taken = await prisma.collaborator.findFirst({ where: { tenantId: c.tenantId, code: input.code, id: { not: c.id } }, select: { id: true } });
  if (taken) return NextResponse.json({ error: "Ese código ya lo tiene otro colaborador" }, { status: 409 });
  await prisma.collaborator.update({ where: { id: c.id }, data: input });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const orders = await prisma.order.count({ where: { collaboratorId: c.id } });
  if (orders) {
    await prisma.collaborator.update({ where: { id: c.id }, data: { active: false } });
    return NextResponse.json({ ok: true, deactivated: true });
  }
  await prisma.collaborator.delete({ where: { id: c.id } });
  return NextResponse.json({ ok: true });
}
