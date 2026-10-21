import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { dnsStatus, normalizeDomain, VERCEL_A, VERCEL_CNAME } from "@/app/lib/domains";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Dominios.
async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, domains: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

async function view(req: NextRequest, t: { slug: string; domains: string[] }, check = false) {
  const origin = new URL(req.url).origin;
  const domains = await Promise.all(t.domains.map(async (d) => ({ host: d, dns: check ? await dnsStatus(d) : null })));
  return { platformUrl: `${origin}/pedir/${t.slug}`, domains, cname: VERCEL_CNAME, aRecord: VERCEL_A };
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json(await view(req, c.tenant, new URL(req.url).searchParams.get("check") === "1"));
}

// POST { domain } → añadir. DELETE { domain } → quitar.
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const { domain } = (await req.json().catch(() => ({}))) as { domain?: string };
  const host = typeof domain === "string" ? normalizeDomain(domain) : null;
  if (!host) return NextResponse.json({ error: "Escribe un dominio válido, por ejemplo pedidos.turestaurante.com" }, { status: 400 });
  if (c.tenant.domains.includes(host)) return NextResponse.json({ error: "Ya lo tienes añadido" }, { status: 400 });
  if (c.tenant.domains.length >= 3) return NextResponse.json({ error: "Como mucho 3 dominios" }, { status: 400 });
  const taken = await prisma.tenant.findFirst({ where: { domains: { has: host } }, select: { id: true } });
  if (taken) return NextResponse.json({ error: "Ese dominio ya lo usa otro restaurante" }, { status: 400 });
  // Prueba de propiedad: el DNS del dominio tiene que apuntar ya a la plataforma.
  // Así nadie puede reservar el dominio de otro restaurante.
  const platformHost = (process.env.APP_HOST ?? "").toLowerCase();
  if (platformHost && (host === platformHost || host.endsWith(`.${platformHost}`))) {
    return NextResponse.json({ error: "Ese dominio es el de la plataforma" }, { status: 400 });
  }
  if ((await dnsStatus(host)) !== "ok") {
    return NextResponse.json(
      { error: `Ese dominio todavía no apunta aquí. Crea primero el registro DNS (CNAME a ${VERCEL_CNAME} o A a ${VERCEL_A}), espera a que se aplique y vuelve a añadirlo.` },
      { status: 400 }
    );
  }
  const t = await prisma.tenant.update({ where: { slug: c.tenant.slug }, data: { domains: { push: host } }, select: { slug: true, domains: true } });
  return NextResponse.json(await view(req, t));
}

export async function DELETE(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const { domain } = (await req.json().catch(() => ({}))) as { domain?: string };
  const t = await prisma.tenant.update({ where: { slug: c.tenant.slug }, data: { domains: c.tenant.domains.filter((d) => d !== domain) }, select: { slug: true, domains: true } });
  return NextResponse.json(await view(req, t));
}
