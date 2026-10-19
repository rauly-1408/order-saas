import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { COLOR_KEYS, fontByName, parseBrand } from "@/app/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PUT /api/admin/[tenant]/brand → nombre, paleta, fuentes y presencia online.
// Las imágenes van por /brand/assets/[kind]. Un color vacío vuelve al de por defecto.
export async function PUT(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, branding: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;

  const input = parseBrand(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const branding = { ...((tenant.branding as Record<string, unknown>) ?? {}) };
  for (const k of COLOR_KEYS) {
    const v = input.colors[k];
    if (v) branding[k] = v;
    else delete branding[k];
  }
  branding.headingFontName = input.headingFontName;
  branding.headingFont = fontByName(input.headingFontName)!.css;
  branding.bodyFontName = input.bodyFontName;
  branding.bodyFont = fontByName(input.bodyFontName)!.css;
  branding.headingCase = input.headingCase;
  branding.borderRadius = input.borderRadius;
  branding.menusPerRow = input.menusPerRow;
  branding.online = input.online;

  await prisma.tenant.update({ where: { id: tenant.id }, data: { name: input.name, branding: branding as object } });
  return NextResponse.json({ ok: true, branding });
}
