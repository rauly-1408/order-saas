import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { canManageTenant } from "@/app/lib/roles";
import { modifierLabels } from "@/app/lib/menuOptions";
import { once, requestIdOf } from "@/app/lib/idempotency";
import { prepareRound, type CustomInput } from "@/app/lib/tableRound";
import type { OrderLineInput } from "@/app/lib/orderPricing";
import { enqueueTablePrint, printTablePayment } from "@/app/lib/printing";
import { issueInvoiceSafe } from "@/app/lib/verifactu";
import { cancelOrder } from "@/app/lib/cancelOrder";
import { notifyCollaboratorSale } from "@/app/lib/push";
import { PAY_METHODS, TableError, addRound, moveTable, payTable, requestBill, setTableCollaborator, voidLine, type PayMethod } from "@/app/lib/tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// La cuenta de una mesa: verla (GET) y, con POST { action }, añadir una ronda,
// anular una línea (gerente), imprimir la cuenta, cobrar (entera o por
// productos), pasarla a otra mesa o cerrarla sin cobrar. Ver docs/MESAS.md

async function context(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const orderId = parts.at(-1) ?? "";
  const slug = parts.at(-3) ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, addons: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, tenantId: true, storeId: true, tableId: true, orderNumber: true } });
  if (!order || order.tenantId !== tenant.id || !order.tableId) return { error: NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 }) };
  if (session.storeId && session.storeId !== order.storeId) return { error: NextResponse.json({ error: "Esta mesa es de otro local" }, { status: 403 }) };
  return { tenant, session, order };
}

const nameOf = (u: { name: string | null; email: string } | undefined) => (u ? u.name?.trim() || u.email.split("@")[0] : null);
const partNote = (n: number | null) => `Parte de la cuenta nº ${n ?? "?"}`;

export async function GET(req: NextRequest) {
  try {
    const ctx = await context(req);
    if ("error" in ctx) return ctx.error;
    const { tenant, session } = ctx;
    const o = await prisma.order.findUnique({
      where: { id: ctx.order.id },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        table: { select: { id: true, name: true, zone: true } },
        invoices: { select: { numSerie: true, invoiceType: true } },
        collaborator: { select: { name: true, code: true, discountPct: true } },
      },
    });
    if (!o || !o.table) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    // Lo ya cobrado por separado de esta cuenta.
    const parts = await prisma.order.findMany({
      where: { tenantId: tenant.id, tableId: o.tableId, notes: partNote(o.orderNumber), createdAt: { gte: o.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { id: true, orderNumber: true, totalCents: true, paymentMethod: true, paidAt: true, status: true },
    });
    const userIds = [...new Set([o.createdByUserId, ...o.items.map((l) => l.addedByUserId)].filter((x): x is string => Boolean(x)))];
    const users = new Map((await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u]));
    const rounds = new Map<number, { round: number; at: Date; by: string | null; lines: unknown[] }>();
    for (const l of o.items) {
      const r = rounds.get(l.round) ?? { round: l.round, at: l.createdAt, by: nameOf(l.addedByUserId ? users.get(l.addedByUserId) : undefined), lines: [] };
      r.lines.push({ id: l.id, name: l.productName, quantity: l.quantity, totalCents: l.totalCents, discountCents: l.discountCents, modifiers: modifierLabels(l.modifiers), note: l.note });
      rounds.set(l.round, r);
    }
    const free = await prisma.diningTable.findMany({
      where: { tenantId: tenant.id, storeId: o.storeId, isActive: true, orders: { none: { status: "OPEN" } } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, zone: true },
    });
    return NextResponse.json({
      order: {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        table: o.table,
        guests: o.guests,
        openedAt: o.createdAt,
        billRequestedAt: o.billRequestedAt,
        totalCents: o.totalCents,
        subtotalCents: o.subtotalCents,
        collaboratorDiscountCents: o.collaboratorDiscountCents,
        collaborator: o.collaborator,
        waiter: nameOf(o.createdByUserId ? users.get(o.createdByUserId) : undefined),
        invoiceNumber: o.invoices.find((i) => i.invoiceType === "F2")?.numSerie ?? null,
      },
      rounds: [...rounds.values()].sort((a, b) => a.round - b.round),
      parts: parts.filter((p) => p.status !== "CANCELLED"),
      freeTables: free,
      canVoid: canManageTenant(session.role),
    });
  } catch (err) {
    console.error("[GET /api/admin/mesas/cuenta]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

type Body = {
  action?: "round" | "void" | "bill" | "pay" | "move" | "cancel" | "collab";
  code?: string;
  items?: OrderLineInput[];
  custom?: CustomInput[];
  requestId?: string; // ronda guardada sin conexión: no se duplica al reenviarla
  lineId?: string;
  method?: string;
  cashTenderedCents?: number;
  units?: { lineId?: unknown; qty?: unknown }[];
  tableId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const ctx = await context(req);
    if ("error" in ctx) return ctx.error;
    const { tenant, session, order } = ctx;
    const b = ((await req.json().catch(() => null)) ?? {}) as Body;
    const manager = canManageTenant(session.role);

    switch (b.action) {
      case "round":
        return await once(tenant.id, requestIdOf(b.requestId), async () => {
          const prepared = await prepareRound(tenant.id, b, manager);
          if ("error" in prepared) return NextResponse.json({ error: prepared.error }, { status: 400 });
          const r = await addRound(tenant.id, order.id, prepared.lines, tenant.addons.includes("COSTS") ? prepared.consumption : [], session.userId, tenant.addons.includes("COSTS") ? prepared.takeaway : []);
          after(() => enqueueTablePrint(order.id, { kind: "ROUND", round: r.round }));
          return NextResponse.json(r);
        });
      case "void": {
        if (!manager) return NextResponse.json({ error: "Solo el gerente puede anular lo que ya se ha enviado a cocina" }, { status: 403 });
        if (typeof b.lineId !== "string") return NextResponse.json({ error: "Línea no válida" }, { status: 400 });
        const { line, totalCents } = await voidLine(tenant.id, order.id, b.lineId);
        after(() => enqueueTablePrint(order.id, { kind: "VOID", lines: [{ quantity: line.quantity, productName: line.productName, productId: line.productId, modifiers: line.modifiers, note: line.note }] }));
        return NextResponse.json({ totalCents });
      }
      case "bill": {
        await requestBill(tenant.id, order.id);
        const printed = await enqueueTablePrint(order.id, { kind: "BILL" });
        return NextResponse.json({ printed });
      }
      case "pay": {
        const method = PAY_METHODS.find((m) => m === b.method) as PayMethod | undefined;
        if (!method) return NextResponse.json({ error: "Elige cómo paga" }, { status: 400 });
        const cash = method === "CASH" && Number.isInteger(b.cashTenderedCents) && (b.cashTenderedCents as number) >= 0 ? (b.cashTenderedCents as number) : null;
        const units = Array.isArray(b.units)
          ? b.units.filter((u): u is { lineId: string; qty: number } => typeof u?.lineId === "string" && Number.isInteger(u?.qty)).slice(0, 200)
          : null;
        const r = await payTable(tenant.id, order.id, { method, cashTenderedCents: cash, units, userId: session.userId });
        // VeriFactu: la factura simplificada al cobrar (antes de responder, para enseñar el número).
        const invoice = await issueInvoiceSafe(r.paidOrderId);
        after(() => Promise.all([printTablePayment(r.paidOrderId), notifyCollaboratorSale(r.paidOrderId)]));
        return NextResponse.json({ ...r, invoiceNumber: invoice?.numSerie ?? null, changeCents: cash != null ? cash - r.totalCents : null });
      }
      case "collab": {
        // Vienen de parte de un colaborador (guía, hotel…): su descuento a la cuenta.
        const r = await setTableCollaborator(tenant.id, order.id, typeof b.code === "string" ? b.code.slice(0, 30) : "");
        return NextResponse.json(r);
      }
      case "move": {
        if (typeof b.tableId !== "string") return NextResponse.json({ error: "Elige la mesa" }, { status: 400 });
        const moved = await moveTable(tenant.id, order.id, b.tableId);
        return NextResponse.json({ tableId: moved.tableId });
      }
      case "cancel": {
        const lines = await prisma.orderLine.count({ where: { orderId: order.id } });
        if (lines && !manager) return NextResponse.json({ error: "Una mesa con consumo solo la puede cerrar sin cobrar el gerente" }, { status: 403 });
        const paidParts = await prisma.order.count({ where: { tenantId: tenant.id, tableId: order.tableId, notes: partNote(order.orderNumber), status: "DELIVERED" } });
        if (paidParts) return NextResponse.json({ error: "Parte de esta cuenta ya está cobrada: cobra el resto" }, { status: 400 });
        const current = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
        if (current?.status !== "OPEN") return NextResponse.json({ error: "Esta mesa ya se ha cobrado o cerrado" }, { status: 409 });
        await cancelOrder(order.id, "RESTAURANT");
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof TableError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof Error && err.message.startsWith("Transicion")) return NextResponse.json({ error: "Esta mesa acaba de cambiar. Vuelve a abrirla." }, { status: 409 });
    console.error("[POST /api/admin/mesas/cuenta]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
