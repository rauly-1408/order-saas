import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { costsTenant } from "@/app/lib/costsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → facturas de proveedor guardadas (las últimas 60) y lo gastado por mes
// (base, IVA soportado y total) para Costes → Compras. Ver docs/MODULO-COSTES.md
export async function GET(req: NextRequest) {
  const ctx = await costsTenant(req);
  if ("error" in ctx) return ctx.error;
  const tenantId = ctx.tenant.id;
  const invoices = await prisma.supplierInvoice.findMany({
    where: { tenantId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 60,
    select: { id: true, supplierName: true, supplierTaxId: true, number: true, date: true, baseCents: true, vatCents: true, totalCents: true, expenseCents: true, vatBreakdown: true, lines: true, createdAt: true },
  });
  // Por mes (fecha de la factura o, si no la tiene, la de registro).
  const months = new Map<string, { month: string; baseCents: number; vatCents: number; totalCents: number; count: number }>();
  for (const i of invoices) {
    const month = (i.date ?? i.createdAt).toISOString().slice(0, 7);
    const m = months.get(month) ?? { month, baseCents: 0, vatCents: 0, totalCents: 0, count: 0 };
    m.baseCents += i.baseCents;
    m.vatCents += i.vatCents;
    m.totalCents += i.totalCents;
    m.count++;
    months.set(month, m);
  }
  return NextResponse.json({ invoices, months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)) });
}
