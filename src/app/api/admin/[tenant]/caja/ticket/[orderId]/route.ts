import { NextRequest, NextResponse } from "next/server";
import type { PaymentMethod } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";
import { accessOf } from "@/app/lib/roles";
import { modifierLabels } from "@/app/lib/menuOptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Un ticket de «Hoy en caja»: GET → qué se cobró; PATCH { method } → cambiar la
// forma de pago (dijo tarjeta y pagó en efectivo o Bizum). El importe y la
// factura no cambian: la forma de pago no va en la factura simplificada, solo en
// el cuadre de la caja. Quien puede cobrar. Ver docs/CAJA.md
const METHODS: PaymentMethod[] = ["CASH", "CARD_TERMINAL", "BIZUM"];

async function load(req: NextRequest, params: Promise<{ tenant: string; orderId: string }>) {
  const { tenant: slug, orderId } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  const noArea = denyUnlessArea(session, "caja");
  if (noArea) return { error: noArea };
  if (!session.seesTakings) return { error: NextResponse.json({ error: "No tienes permiso para ver lo recaudado" }, { status: 403 }) };
  const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant.id } });
  if (!order) return { error: NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 }) };
  if (session.storeId && session.storeId !== order.storeId) return { error: NextResponse.json({ error: "Este pedido es de otro local" }, { status: 403 }) };
  return { session, order };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string; orderId: string }> }) {
  const a = await load(req, params);
  if ("error" in a) return a.error;
  const lines = await prisma.orderLine.findMany({ where: { orderId: a.order.id }, orderBy: { createdAt: "asc" }, select: { id: true, productName: true, quantity: true, totalCents: true, modifiers: true, note: true } });
  const invoice = await prisma.invoice.findFirst({ where: { orderId: a.order.id, invoiceType: "F2" }, select: { numSerie: true } });
  return NextResponse.json({
    lines: lines.map((l) => ({ id: l.id, name: l.productName, quantity: l.quantity, totalCents: l.totalCents, modifiers: modifierLabels(l.modifiers), note: l.note })),
    invoiceNumber: invoice?.numSerie ?? null,
    paidAt: a.order.paidAt,
    notes: a.order.notes,
    customer: {
      name: a.order.customerName,
      phone: a.order.customerPhone,
      address: [a.order.customerAddress, a.order.customerPostalCode].filter(Boolean).join(", ") || null,
      email: a.order.customerId ? ((await prisma.customer.findUnique({ where: { id: a.order.customerId }, select: { email: true } }))?.email ?? null) : null,
    },
    channel: a.order.channel,
    dineIn: a.order.dineIn,
    source: a.order.source,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tenant: string; orderId: string }> }) {
  try {
    const a = await load(req, params);
    if ("error" in a) return a.error;
    if (!accessOf(a.session).cobrar) return NextResponse.json({ error: "Tu puesto no puede cambiar cobros: avisa al encargado" }, { status: 403 });
    const b = ((await req.json().catch(() => null)) ?? {}) as { method?: unknown };
    const method = b.method as PaymentMethod;
    if (!METHODS.includes(method)) return NextResponse.json({ error: "Elige efectivo, datáfono o Bizum" }, { status: 400 });
    const o = a.order;
    if (o.status === "CANCELLED" || o.paymentStatus !== "PAID") return NextResponse.json({ error: "Este pedido no está cobrado" }, { status: 409 });
    if (o.paymentProvider) return NextResponse.json({ error: "Se pagó online: la forma de pago no se puede cambiar" }, { status: 409 });
    if (!METHODS.includes(o.paymentMethod)) return NextResponse.json({ error: "Esta forma de pago no se puede cambiar" }, { status: 409 });
    // Pasa a ser un pago de una sola forma (si era mixto, deja de serlo).
    await prisma.order.update({ where: { id: o.id }, data: { paymentMethod: method, cashPartCents: 0, cashTenderedCents: null } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/admin/caja/ticket]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
