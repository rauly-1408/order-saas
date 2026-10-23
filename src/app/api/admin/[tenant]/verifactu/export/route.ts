import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { amount } from "@/app/lib/verifactu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → registro de facturación completo en CSV (para la gestoría o una
// inspección). Solo con «Ve lo recaudado». Ver docs/VERIFACTU.md
export async function GET(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  const session = await getSessionFromRequest(req);
  if (!session?.seesTakings) return NextResponse.json({ error: "No tienes permiso para ver las ventas" }, { status: 403 });
  const rows = await prisma.invoice.findMany({ where: { tenantId: tenant.id }, orderBy: { chainIndex: "asc" }, include: { order: { select: { orderNumber: true } } } });
  const rect = new Map(rows.map((r) => [r.id, r.numSerie]));
  const head = ["Orden", "NumSerieFactura", "TipoFactura", "FechaExpedicion", "FechaHoraHusoGenRegistro", "NIF", "RazonSocial", "TipoIVA", "BaseImponible", "CuotaIVA", "ImporteTotal", "Rectifica", "Pedido", "HuellaAnterior", "Huella", "Modo", "Entorno", "EstadoAEAT", "QR"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.chainIndex, r.numSerie, r.invoiceType, r.issueDate, r.genTimestamp, r.issuerNif, r.issuerName, r.taxRate, amount(r.baseCents), amount(r.taxCents), amount(r.totalCents), r.rectifiedInvoiceId ? rect.get(r.rectifiedInvoiceId) ?? "" : "", r.order.orderNumber ?? "", r.prevHash ?? "", r.hash, r.mode, r.environment, r.aeatStatus, r.qrUrl]
      .map(esc)
      .join(";")
  );
  const csv = "﻿" + [head.join(";"), ...lines].join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="registro-facturacion-${tenant.slug}.csv"` } });
}
