import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { readBusiness } from "@/app/lib/business";
import { readVerifactu, verifyChain } from "@/app/lib/verifactu";

// Comunes a las rutas de Configuración → Facturación (VeriFactu).
export async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  const session = await getSessionFromRequest(req);
  return { tenant, sees: Boolean(session?.seesTakings) };
}

export async function payload(tenantId: string, settings: unknown, sees: boolean) {
  const cfg = readVerifactu(settings);
  const biz = readBusiness(settings);
  const [count, pending, rejected, chain, sender, recent] = await Promise.all([
    prisma.invoice.count({ where: { tenantId } }),
    prisma.invoice.count({ where: { tenantId, aeatStatus: "PENDIENTE_ENVIO" } }),
    prisma.invoice.count({ where: { tenantId, aeatStatus: "RECHAZADO" } }),
    verifyChain(tenantId),
    prisma.verifactuSender.findUnique({ where: { tenantId }, select: { certSealed: true, holderName: true, holderNif: true, notAfter: true, uploadedAt: true, lastSentAt: true, lastError: true, nextSendAt: true } }),
    sees
      ? prisma.invoice.findMany({
          where: { tenantId },
          orderBy: { chainIndex: "desc" },
          take: 50,
          select: { id: true, numSerie: true, invoiceType: true, issueDate: true, totalCents: true, taxCents: true, aeatStatus: true, aeatResponse: true, hash: true, qrUrl: true, order: { select: { orderNumber: true } } },
        })
      : Promise.resolve([]),
  ]);
  return {
    ...cfg,
    fiscal: { nif: biz.taxId, name: biz.legalName, ok: Boolean(biz.taxId && biz.legalName) },
    producer: { name: process.env.VERIFACTU_PRODUCER_NAME || null, nif: process.env.VERIFACTU_PRODUCER_NIF || null },
    // El certificado nunca sale del servidor: solo a nombre de quién está y hasta cuándo vale.
    certificate: sender?.certSealed
      ? { holderName: sender.holderName, holderNif: sender.holderNif, notAfter: sender.notAfter, uploadedAt: sender.uploadedAt, daysLeft: sender.notAfter ? Math.floor((sender.notAfter.getTime() - Date.now()) / 86_400_000) : null }
      : null,
    sending: { lastSentAt: sender?.lastSentAt ?? null, lastError: sender?.lastError ?? null, nextSendAt: sender?.nextSendAt ?? null },
    count,
    pending,
    rejected,
    chain,
    sees,
    recent,
  };
}
