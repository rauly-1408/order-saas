import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { emailConfigured, sendEmail } from "@/app/lib/email";
import { invoiceEmail, loadInvoiceDoc } from "@/app/lib/invoiceDoc";
import { VerifactuError, issueFullInvoice, readRecipient, readVerifactu } from "@/app/lib/verifactu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Facturas completas a nombre del cliente. Cualquier usuario del restaurante (la
// pide el cliente en el mostrador); con local asignado, solo los pedidos de su local.
//   GET ?buscar=T2026-000012 | 83   → el pedido de ese ticket o número
//   GET ?pedido=<id>                → ese pedido
//   GET                             → las últimas facturas hechas
//   POST { orderId, nif, name, address, email? } → la emite (y la envía si hay email)
// Ver docs/VERIFACTU.md

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  return { tenant, storeId: session.storeId ?? null };
}

const orderView = {
  id: true,
  orderNumber: true,
  createdAt: true,
  customerName: true,
  totalCents: true,
  paymentStatus: true,
  status: true,
  storeId: true,
  items: { select: { quantity: true, productName: true }, orderBy: { createdAt: "asc" as const } },
  invoices: { select: { id: true, invoiceType: true, numSerie: true, recipientName: true } },
};

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const url = new URL(req.url);
    const store = c.storeId ? { storeId: c.storeId } : {};
    const cfg = readVerifactu(c.tenant.settings);
    const base = { enabled: cfg.enabled, email: emailConfigured() };

    const q = (url.searchParams.get("buscar") ?? "").trim().toUpperCase().replace(/^#/, "");
    const id = url.searchParams.get("pedido");
    if (q || id) {
      let order = null;
      if (id) order = await prisma.order.findFirst({ where: { id, tenantId: c.tenant.id, ...store }, select: orderView });
      else if (/^[A-Z]{1,4}\d{4}-\d{1,6}$/.test(q)) {
        const [series, n] = q.split("-");
        const inv = await prisma.invoice.findFirst({ where: { tenantId: c.tenant.id, numSerie: `${series}-${n.padStart(6, "0")}` }, select: { orderId: true } });
        if (inv) order = await prisma.order.findFirst({ where: { id: inv.orderId, tenantId: c.tenant.id, ...store }, select: orderView });
      } else if (/^\d{1,9}$/.test(q)) {
        order = await prisma.order.findFirst({ where: { tenantId: c.tenant.id, orderNumber: Number(q), ...store }, orderBy: { createdAt: "desc" }, select: orderView });
      }
      if (!order) return NextResponse.json({ ...base, order: null, error: "No encontramos ese ticket. Prueba con el número del ticket (T2026-000012) o del pedido (83)." });
      return NextResponse.json({ ...base, order });
    }

    const recent = await prisma.invoice.findMany({
      where: { tenantId: c.tenant.id, invoiceType: { in: ["F1", "F3"] }, ...store },
      orderBy: { chainIndex: "desc" },
      take: 30,
      select: { id: true, numSerie: true, issueDate: true, totalCents: true, recipientName: true, recipientNif: true, order: { select: { orderNumber: true } } },
    });
    return NextResponse.json({ ...base, recent });
  } catch (err) {
    console.error("[GET /api/admin/facturas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const orderId = typeof b.orderId === "string" ? b.orderId : "";
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: c.tenant.id }, select: { id: true, storeId: true } });
    if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    if (c.storeId && c.storeId !== order.storeId) return NextResponse.json({ error: "Este pedido es de otro local" }, { status: 403 });
    const recipient = readRecipient(b);
    if (typeof recipient === "string") return NextResponse.json({ error: recipient }, { status: 400 });
    const email = typeof b.email === "string" ? b.email.trim() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "El email no es válido" }, { status: 400 });

    const invoice = await issueFullInvoice(order.id, recipient);
    let sent = false;
    if (email) {
      const doc = await loadInvoiceDoc(c.tenant.id, invoice.id);
      if (doc) sent = await sendEmail({ to: email, ...invoiceEmail(doc) });
    }
    return NextResponse.json({ id: invoice.id, numSerie: invoice.numSerie, sent });
  } catch (err) {
    if (err instanceof VerifactuError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[POST /api/admin/facturas]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
