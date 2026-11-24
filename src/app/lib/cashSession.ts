// Caja del local: el día (se abre con un fondo y se cierra con el informe Z)
// dividido en turnos (cada cierre de turno es un informe X). Ver docs/CAJA.md
//   - Abrir caja: cualquiera con Caja (también un camarero).
//   - Cerrar turno (X): cualquiera con Caja. Cuenta el cajón; si no cuadra,
//     nota obligatoria. El siguiente turno empieza con el efectivo contado.
//   - Cerrar el día (Z): encargado o gerente. Cierra el último turno y el día.
import type { CashMovement, CashSession, CashShift, PaymentMethod } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { readTax } from "@/app/lib/storePolicies";

export type PayKey = PaymentMethod; // CASH | CARD_TERMINAL | BIZUM | CARD | IN_STORE
export type Invitation = { name: string; quantity: number; valueCents: number; by: string | null };
export type SessionFigures = {
  orders: number; // pedidos cobrados
  byPayment: Record<PayKey, number>; // cobrado por forma de pago
  totalCents: number; // todo lo cobrado
  cashSalesCents: number; // cobrado en efectivo
  inCents: number; // entradas de efectivo
  outCents: number; // salidas de efectivo
  expectedCashCents: number; // efectivo al empezar + efectivo cobrado + entradas − salidas
  // Lo que lleva un cierre de TPV de verdad:
  tipsCents: number; // propinas (incluidas en lo cobrado)
  discountCents: number; // descuentos de pedido (cupones, promociones, fidelización)
  cancelled: number; // pedidos cancelados
  refundedCents: number; // devuelto al cliente
  taxRate: number; // IVA de los precios (%)
  baseCents: number; // base imponible de lo cobrado (sin propinas)
  taxCents: number; // IVA incluido en lo cobrado (sin propinas)
  invitations: Invitation[]; // lo que ha invitado la casa (líneas a 0 €), y quién
  invitedCents: number; // valor de lo invitado
};

const ZERO: Record<PayKey, number> = { CASH: 0, CARD_TERMINAL: 0, BIZUM: 0, CARD: 0, IN_STORE: 0 };

type SessionWithMoves = CashSession & { movements: CashMovement[]; shifts?: CashShift[] };

// Cobros del local entre dos momentos. Cuenta el momento del cobro (paidAt);
// los pedidos antiguos sin paidAt, por su creación.
export async function rangeFigures(session: SessionWithMoves, from: Date, to: Date, openingCashCents: number): Promise<SessionFigures> {
  const window = { gte: from, lte: to };
  const paidWhere = { tenantId: session.tenantId, storeId: session.storeId, paymentStatus: "PAID" as const, OR: [{ paidAt: window }, { paidAt: null, createdAt: window }] };
  const [paid, extra, cancelledRows, freeLines, tenant] = await Promise.all([
    prisma.order.groupBy({ by: ["paymentMethod"], where: paidWhere, _sum: { totalCents: true, cashPartCents: true }, _count: { _all: true } }),
    prisma.order.aggregate({ where: paidWhere, _sum: { tipCents: true, discountCents: true } }),
    prisma.order.findMany({ where: { tenantId: session.tenantId, storeId: session.storeId, status: "CANCELLED", updatedAt: window }, select: { totalCents: true, paymentStatus: true } }),
    // Invitaciones: líneas que se dejaron a 0 € (mesa «invita la casa» o descuento del 100 % en Caja).
    prisma.orderLine.findMany({
      where: { totalCents: 0, order: paidWhere, OR: [{ discountCents: { gt: 0 } }, { basePriceCents: { gt: 0 } }] },
      select: { productName: true, quantity: true, basePriceCents: true, discountCents: true, addedByUserId: true, order: { select: { createdByUserId: true } } },
    }),
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { settings: true } }),
  ]);
  const byPayment = { ...ZERO };
  let orders = 0;
  for (const g of paid) {
    // Pago mixto: su parte en efectivo cuenta como efectivo (está en el cajón).
    const cashPart = g.paymentMethod === "CASH" ? 0 : (g._sum.cashPartCents ?? 0);
    byPayment[g.paymentMethod] += (g._sum.totalCents ?? 0) - cashPart;
    byPayment.CASH += cashPart;
    orders += g._count._all;
  }
  const moves = session.movements.filter((m) => m.createdAt >= from && m.createdAt <= to);
  const inCents = moves.filter((m) => m.kind === "IN").reduce((a, m) => a + m.amountCents, 0);
  const outCents = moves.filter((m) => m.kind === "OUT").reduce((a, m) => a + m.amountCents, 0);
  const totalCents = Object.values(byPayment).reduce((a, v) => a + v, 0);
  const tipsCents = extra._sum.tipCents ?? 0;
  const taxRate = readTax(tenant?.settings).rate;
  // Los precios llevan el IVA incluido; las propinas no llevan IVA.
  const taxable = Math.max(0, totalCents - tipsCents);
  const baseCents = Math.round(taxable / (1 + taxRate / 100));

  // Quién invitó: el que añadió la línea (mesas) o el que hizo el pedido (Caja).
  const userIds = [...new Set(freeLines.map((l) => l.addedByUserId ?? l.order.createdByUserId).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name || u.email.split("@")[0]]));
  const invitations: Invitation[] = freeLines.map((l) => ({
    name: l.productName,
    quantity: l.quantity,
    valueCents: l.discountCents || l.basePriceCents * l.quantity,
    by: nameOf.get(l.addedByUserId ?? l.order.createdByUserId ?? "") ?? null,
  }));

  return {
    orders,
    byPayment,
    totalCents,
    cashSalesCents: byPayment.CASH,
    inCents,
    outCents,
    expectedCashCents: openingCashCents + byPayment.CASH + inCents - outCents,
    tipsCents,
    discountCents: extra._sum.discountCents ?? 0,
    cancelled: cancelledRows.length,
    refundedCents: cancelledRows.filter((o) => o.paymentStatus === "REFUNDED").reduce((a, o) => a + o.totalCents, 0),
    taxRate,
    baseCents,
    taxCents: taxable - baseCents,
    invitations,
    invitedCents: invitations.reduce((a, i) => a + i.valueCents, 0),
  };
}

// Todo el día (desde que se abrió la caja), con el fondo de apertura.
export async function sessionFigures(session: SessionWithMoves, until = session.closedAt ?? new Date()): Promise<SessionFigures> {
  return rangeFigures(session, session.openedAt, until, session.openingFloatCents);
}

// El turno en curso: empieza al abrir la caja o al cerrar el turno anterior,
// con el efectivo contado entonces.
export function currentShift(session: SessionWithMoves & { shifts: CashShift[] }) {
  const last = [...session.shifts].sort((a, b) => b.number - a.number)[0];
  return {
    number: (last?.number ?? 0) + 1,
    startedAt: last?.endedAt ?? session.openedAt,
    startedByName: last ? last.closedByName : session.openedByName,
    openingCashCents: last ? last.countedCashCents : session.openingFloatCents,
  };
}

export async function shiftFigures(session: SessionWithMoves & { shifts: CashShift[] }, until = new Date()) {
  const cur = currentShift(session);
  return { shift: cur, figures: await rangeFigures(session, cur.startedAt, until, cur.openingCashCents) };
}

// Lo que se guarda de un turno o de un día.
export const summaryOf = (f: SessionFigures) => ({
  orders: f.orders,
  byPayment: f.byPayment,
  totalCents: f.totalCents,
  inCents: f.inCents,
  outCents: f.outCents,
  tipsCents: f.tipsCents,
  discountCents: f.discountCents,
  cancelled: f.cancelled,
  refundedCents: f.refundedCents,
  taxRate: f.taxRate,
  baseCents: f.baseCents,
  taxCents: f.taxCents,
  invitations: f.invitations,
  invitedCents: f.invitedCents,
});

export async function openSession(tenantId: string, storeId: string) {
  return prisma.cashSession.findFirst({
    where: { tenantId, storeId, closedAt: null },
    include: { movements: { orderBy: { createdAt: "asc" } }, shifts: { orderBy: { number: "asc" } } },
    orderBy: { openedAt: "desc" },
  });
}

export const MOVE_REASONS = ["Pago a proveedor", "Retirada al banco", "Cambio para el cajón", "Propinas", "Otro"] as const;
