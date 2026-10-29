import { NextResponse, after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { canManageTenant } from "@/app/lib/roles";
import { once, requestIdOf } from "@/app/lib/idempotency";
import { prepareRound, type CustomInput } from "@/app/lib/tableRound";
import type { OrderLineInput } from "@/app/lib/orderPricing";
import { enqueueTablePrint, printTablePayment } from "@/app/lib/printing";
import { issueInvoiceSafe } from "@/app/lib/verifactu";
import { cancelOrder } from "@/app/lib/cancelOrder";
import { notifyCollaboratorSale } from "@/app/lib/push";
import { PAY_METHODS, addRound, moveTable, payTable, requestBill, setTableCollaborator, voidLine, type PayMethod } from "@/app/lib/tables";

// Acciones sobre la cuenta de una mesa (ronda, anular, cuenta, cobrar, cambiar
// de mesa, cerrar, colaborador). Las usan POST /mesas/[orderId] y, para lo
// guardado sin conexión en una mesa abierta sin conexión, POST /mesas
// { action: "table", tableId, op }. Ronda, cuenta, cobro y cambio de mesa
// llevan `requestId`: si llegan dos veces no se duplican. Ver docs/MESAS.md

export const partNote = (n: number | null) => `Parte de la cuenta nº ${n ?? "?"}`;

export type TableActionBody = {
  action?: "round" | "void" | "bill" | "pay" | "move" | "cancel" | "collab";
  code?: string;
  items?: OrderLineInput[];
  custom?: CustomInput[];
  requestId?: string; // guardado sin conexión: no se duplica al reenviarlo
  lineId?: string;
  method?: string;
  cashTenderedCents?: number;
  units?: { lineId?: unknown; qty?: unknown }[];
  tableId?: string;
};

type Ctx = {
  tenant: { id: string; addons: string[] };
  session: { userId: string; role: string };
  order: { id: string; tableId: string | null; orderNumber: number | null };
};

export async function runTableAction({ tenant, session, order }: Ctx, b: TableActionBody): Promise<NextResponse> {
  const manager = canManageTenant(session.role);
  const rid = requestIdOf(b.requestId);
  switch (b.action) {
    case "round":
      return once(tenant.id, rid, async () => {
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
    case "bill":
      return once(tenant.id, rid, async () => {
        await requestBill(tenant.id, order.id);
        const printed = await enqueueTablePrint(order.id, { kind: "BILL" });
        return NextResponse.json({ printed });
      });
    case "pay": {
      const method = PAY_METHODS.find((m) => m === b.method) as PayMethod | undefined;
      if (!method) return NextResponse.json({ error: "Elige cómo paga" }, { status: 400 });
      const cash = method === "CASH" && Number.isInteger(b.cashTenderedCents) && (b.cashTenderedCents as number) >= 0 ? (b.cashTenderedCents as number) : null;
      const units = Array.isArray(b.units)
        ? b.units.filter((u): u is { lineId: string; qty: number } => typeof u?.lineId === "string" && Number.isInteger(u?.qty)).slice(0, 200)
        : null;
      return once(tenant.id, rid, async () => {
        const r = await payTable(tenant.id, order.id, { method, cashTenderedCents: cash, units, userId: session.userId });
        // VeriFactu: la factura simplificada al cobrar (antes de responder, para enseñar el número).
        const invoice = await issueInvoiceSafe(r.paidOrderId);
        after(() => Promise.all([printTablePayment(r.paidOrderId), notifyCollaboratorSale(r.paidOrderId)]));
        return NextResponse.json({ ...r, invoiceNumber: invoice?.numSerie ?? null, changeCents: cash != null ? cash - r.totalCents : null });
      });
    }
    case "collab": {
      // Vienen de parte de un colaborador (guía, hotel…): su descuento a la cuenta.
      const r = await setTableCollaborator(tenant.id, order.id, typeof b.code === "string" ? b.code.slice(0, 30) : "");
      return NextResponse.json(r);
    }
    case "move": {
      if (typeof b.tableId !== "string") return NextResponse.json({ error: "Elige la mesa" }, { status: 400 });
      const to = b.tableId;
      return once(tenant.id, rid, async () => {
        const moved = await moveTable(tenant.id, order.id, to);
        return NextResponse.json({ tableId: moved.tableId });
      });
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
}
