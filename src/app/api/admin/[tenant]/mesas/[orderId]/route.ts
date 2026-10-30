import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { accessOf } from "@/app/lib/roles";
import { modifierLabels } from "@/app/lib/menuOptions";
import { TableError, tableLabel } from "@/app/lib/tables";
import { partNote, runTableAction, type TableActionBody } from "@/app/lib/tableActions";

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
  if (!accessOf(session).mesas) return { error: NextResponse.json({ error: "Tu puesto no tiene acceso a Mesas" }, { status: 403 }) };
  return { tenant, session, order };
}

const nameOf = (u: { name: string | null; email: string } | undefined) => (u ? u.name?.trim() || u.email.split("@")[0] : null);

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
      r.lines.push({ id: l.id, name: l.productName, quantity: l.quantity, totalCents: l.totalCents, discountCents: l.discountCents, modifiers: modifierLabels(l.modifiers), note: l.note, ready: Boolean(l.readyAt) });
      rounds.set(l.round, r);
    }
    // Otras mesas abiertas del local: para «Juntar con otra mesa».
    const busy = await prisma.order.findMany({
      where: { tenantId: tenant.id, storeId: o.storeId, status: "OPEN", tableId: { not: null }, id: { not: o.id } },
      orderBy: { createdAt: "asc" },
      select: { customerName: true, totalCents: true, table: { select: { id: true, name: true, zone: true } } },
    });
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
        label: tableLabel(o.customerName, o.table.name),
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
      busyTables: busy.flatMap((b) => (b.table ? [{ ...b.table, label: tableLabel(b.customerName, b.table.name), totalCents: b.totalCents }] : [])),
      canVoid: accessOf(session).anular,
      canCharge: accessOf(session).cobrar,
    });
  } catch (err) {
    console.error("[GET /api/admin/mesas/cuenta]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await context(req);
    if ("error" in ctx) return ctx.error;
    const b = ((await req.json().catch(() => null)) ?? {}) as TableActionBody;
    return await runTableAction(ctx, b);
  } catch (err) {
    if (err instanceof TableError) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof Error && err.message.startsWith("Transicion")) return NextResponse.json({ error: "Esta mesa acaba de cambiar. Vuelve a abrirla." }, { status: 409 });
    console.error("[POST /api/admin/mesas/cuenta]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
