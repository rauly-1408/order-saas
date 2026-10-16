import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { parseBusiness } from "@/app/lib/business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/[tenant]/business → datos del negocio (pie de la tienda y textos legales).
export async function PUT(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  const business = parseBusiness(await req.json().catch(() => null));
  if (typeof business === "string") return NextResponse.json({ error: business }, { status: 400 });
  const settings = { ...((tenant.settings as Record<string, unknown>) ?? {}), business };
  await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: settings as object } });
  return NextResponse.json({ business });
}
