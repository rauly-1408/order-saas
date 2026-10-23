import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { readBusiness } from "@/app/lib/business";
import { readVerifactu, verifyChain } from "@/app/lib/verifactu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Facturación (VeriFactu). Ver docs/VERIFACTU.md
//   GET → configuración, datos fiscales, estado de la cadena y, con «Ve lo
//         recaudado», los últimos registros
//   PUT { enabled, mode, environment, seriesPrefix }

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  const session = await getSessionFromRequest(req);
  return { tenant, sees: Boolean(session?.seesTakings) };
}

async function payload(tenantId: string, settings: unknown, sees: boolean) {
  const cfg = readVerifactu(settings);
  const biz = readBusiness(settings);
  const [count, pending, chain, recent] = await Promise.all([
    prisma.invoice.count({ where: { tenantId } }),
    prisma.invoice.count({ where: { tenantId, aeatStatus: "PENDIENTE_ENVIO" } }),
    verifyChain(tenantId),
    sees
      ? prisma.invoice.findMany({
          where: { tenantId },
          orderBy: { chainIndex: "desc" },
          take: 50,
          select: { id: true, numSerie: true, invoiceType: true, issueDate: true, totalCents: true, taxCents: true, aeatStatus: true, hash: true, qrUrl: true, order: { select: { orderNumber: true } } },
        })
      : Promise.resolve([]),
  ]);
  return {
    ...cfg,
    fiscal: { nif: biz.taxId, name: biz.legalName, ok: Boolean(biz.taxId && biz.legalName) },
    producer: { name: process.env.VERIFACTU_PRODUCER_NAME || null, nif: process.env.VERIFACTU_PRODUCER_NIF || null },
    certificate: false, // el envío a la AEAT llega cuando el restaurante suba su certificado
    count,
    pending,
    chain,
    sees,
    recent,
  };
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json(await payload(c.tenant.id, c.tenant.settings, c.sees));
}

export async function PUT(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const next = readVerifactu({ verifactu: b });
  const biz = readBusiness(c.tenant.settings);
  if (next.enabled && !(biz.taxId && biz.legalName)) {
    return NextResponse.json({ error: "Para facturar con VeriFactu, completa antes la razón social y el NIF en Información del negocio" }, { status: 400 });
  }
  const settings = { ...((c.tenant.settings as Record<string, unknown>) ?? {}), verifactu: next };
  await prisma.tenant.update({ where: { id: c.tenant.id }, data: { settings: settings as object } });
  return NextResponse.json(await payload(c.tenant.id, settings, c.sees));
}
