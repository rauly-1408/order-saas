import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/[tenant]/retention/customers/[id]  { marketingConsent: false }
// Solo permite DAR DE BAJA (p. ej. el cliente respondió "BAJA"). El alta la da
// únicamente el propio cliente al marcar la casilla en el checkout (RGPD).
export async function PATCH(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const id = new URL(req.url).pathname.split("/").pop() ?? "";
  const body = (await req.json().catch(() => null)) as { marketingConsent?: unknown } | null;
  if (body?.marketingConsent !== false) {
    return NextResponse.json({ error: "Solo el cliente puede dar su consentimiento, desde el checkout" }, { status: 400 });
  }
  const result = await prisma.customer.updateMany({
    where: { id, tenantId: ctx.tenant.id },
    data: { marketingConsent: false, marketingConsentAt: null },
  });
  if (result.count === 0) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
  // Los envíos pendientes a este cliente se descartan.
  await prisma.campaignSend.updateMany({ where: { customerId: id, status: "PENDING" }, data: { status: "FAILED" } });
  return NextResponse.json({ ok: true });
}
