// Cierre de caja: lo que debería haber en el cajón y el resumen de la sesión.
// Una sesión por local: se abre con un fondo y se cierra contando el efectivo.
// Ver docs/CAJA.md
import type { CashMovement, CashSession, PaymentMethod } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

export type PayKey = PaymentMethod; // CASH | CARD_TERMINAL | BIZUM | CARD | IN_STORE
export type SessionFigures = {
  orders: number; // pedidos cobrados en la sesión
  byPayment: Record<PayKey, number>; // cobrado por forma de pago
  totalCents: number; // todo lo cobrado
  cashSalesCents: number; // cobrado en efectivo
  inCents: number; // entradas de efectivo
  outCents: number; // salidas de efectivo
  expectedCashCents: number; // fondo + efectivo + entradas − salidas
};

const ZERO: Record<PayKey, number> = { CASH: 0, CARD_TERMINAL: 0, BIZUM: 0, CARD: 0, IN_STORE: 0 };

// Cobros del local entre la apertura y el cierre (o ahora). Cuenta el momento
// del cobro (paidAt); los pedidos antiguos sin paidAt, por su creación.
export async function sessionFigures(session: CashSession & { movements: CashMovement[] }, until = session.closedAt ?? new Date()): Promise<SessionFigures> {
  const window = { gte: session.openedAt, lte: until };
  const paid = await prisma.order.groupBy({
    by: ["paymentMethod"],
    where: {
      tenantId: session.tenantId,
      storeId: session.storeId,
      paymentStatus: "PAID",
      OR: [{ paidAt: window }, { paidAt: null, createdAt: window }],
    },
    _sum: { totalCents: true },
    _count: { _all: true },
  });
  const byPayment = { ...ZERO };
  let orders = 0;
  for (const g of paid) {
    byPayment[g.paymentMethod] += g._sum.totalCents ?? 0;
    orders += g._count._all;
  }
  const inCents = session.movements.filter((m) => m.kind === "IN").reduce((a, m) => a + m.amountCents, 0);
  const outCents = session.movements.filter((m) => m.kind === "OUT").reduce((a, m) => a + m.amountCents, 0);
  const totalCents = Object.values(byPayment).reduce((a, v) => a + v, 0);
  return {
    orders,
    byPayment,
    totalCents,
    cashSalesCents: byPayment.CASH,
    inCents,
    outCents,
    expectedCashCents: session.openingFloatCents + byPayment.CASH + inCents - outCents,
  };
}

export async function openSession(tenantId: string, storeId: string) {
  return prisma.cashSession.findFirst({ where: { tenantId, storeId, closedAt: null }, include: { movements: { orderBy: { createdAt: "asc" } } }, orderBy: { openedAt: "desc" } });
}

export const MOVE_REASONS = ["Pago a proveedor", "Retirada al banco", "Cambio para el cajón", "Propinas", "Otro"] as const;
