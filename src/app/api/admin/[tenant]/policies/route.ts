import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { LEGAL_DOCS, readBusiness } from "@/app/lib/business";
import { legalTemplate } from "@/app/lib/legalTexts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → modelo de redacción de cada política, con los datos del negocio ya
// puestos, para que el dueño lo adapte (Configuración → Políticas).
export async function GET(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, slug: true, settings: true, domains: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  const site = tenant.domains[0] ? `https://${tenant.domains[0]}` : `${new URL(req.url).origin}/pedir/${tenant.slug}`;
  const business = readBusiness(tenant.settings);
  return NextResponse.json({ templates: Object.fromEntries(LEGAL_DOCS.map((d) => [d.slug, legalTemplate(d.slug, business, tenant.name, site)])) });
}
