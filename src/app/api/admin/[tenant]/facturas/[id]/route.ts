import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";
import { emailConfigured, sendEmail } from "@/app/lib/email";
import { invoiceEmail, loadInvoiceDoc } from "@/app/lib/invoiceDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/facturas/[id] { email } → envía la factura completa
// por email al cliente. Cualquier usuario del restaurante. Ver docs/VERIFACTU.md
export async function POST(req: NextRequest) {
  try {
    const parts = new URL(req.url).pathname.split("/");
    const slug = parts[parts.indexOf("admin") + 1];
    const id = parts[parts.length - 1];
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    const noArea = denyUnlessArea(session, "facturas");
    if (noArea) return noArea;
    if (!emailConfigured()) return NextResponse.json({ error: "El envío de emails no está configurado" }, { status: 400 });

    const inv = await prisma.invoice.findFirst({ where: { id, tenantId: tenant.id }, select: { storeId: true } });
    if (!inv) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    if (session.storeId && session.storeId !== inv.storeId) return NextResponse.json({ error: "Esta factura es de otro local" }, { status: 403 });
    const b = (await req.json().catch(() => ({}))) as { email?: unknown };
    const email = typeof b.email === "string" ? b.email.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "El email no es válido" }, { status: 400 });

    const doc = await loadInvoiceDoc(tenant.id, id);
    if (!doc) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    const ok = await sendEmail({ to: email, ...invoiceEmail(doc) });
    if (!ok) return NextResponse.json({ error: "No se pudo enviar el email" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/admin/facturas/:id]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
