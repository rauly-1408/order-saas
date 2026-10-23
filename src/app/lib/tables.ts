// Mesas: cuentas abiertas por mesa a las que se añaden rondas hasta cobrarlas.
// Una cuenta es un pedido en estado OPEN con tableId; al cobrarla pasa a
// DELIVERED y pagado, con su factura simplificada (VeriFactu) como cualquier
// cobro de la Caja. Ver docs/MESAS.md
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { applyStockDeltas, orderConsumption, type ConsumptionItem } from "@/app/lib/inventory";

type Tx = Prisma.TransactionClient;

export class TableError extends Error {}

export type PayMethod = "CASH" | "CARD_TERMINAL" | "BIZUM";
export const PAY_METHODS: readonly PayMethod[] = ["CASH", "CARD_TERMINAL", "BIZUM"];
export const MAX_GUESTS = 50;
export const MAX_TABLES_PER_STORE = 200;

// ─── Cálculos puros (probados en lib/__tests__/tables.test.ts) ─────────────

// Parte de una línea que se cobra aparte: el importe proporcional a las
// unidades, sin céntimos perdidos (lo que queda en la línea es el resto exacto).
export function splitLineAmounts(line: { quantity: number; totalCents: number; discountCents: number }, units: number): { movedTotal: number; movedDiscount: number } {
  if (!Number.isInteger(units) || units < 1 || units > line.quantity) throw new TableError("Cantidad no válida");
  if (units === line.quantity) return { movedTotal: line.totalCents, movedDiscount: line.discountCents };
  return {
    movedTotal: Math.round((line.totalCents * units) / line.quantity),
    movedDiscount: Math.round((line.discountCents * units) / line.quantity),
  };
}

// Dividir a partes iguales: lo que paga cada uno (los céntimos que sobran, a los primeros).
export function equalShares(totalCents: number, people: number): number[] {
  const n = Math.max(1, Math.min(Math.floor(people), 50));
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

// Nombres para crear varias mesas de golpe: «1–10» o con prefijo («T1–T6»).
export function tableNames(prefix: string, from: number, to: number): string[] {
  const a = Math.max(1, Math.floor(from));
  const b = Math.min(Math.floor(to), a + 99);
  if (!(b >= a)) return [];
  const p = prefix.trim().slice(0, 12);
  return Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`);
}

// ─── Base de datos ──────────────────────────────────────────────────────────

// Totales de la cuenta a partir de sus líneas (nunca sumando a ojo).
async function recompute(tx: Tx, orderId: string): Promise<number> {
  const agg = await tx.orderLine.aggregate({ where: { orderId }, _sum: { totalCents: true } });
  const subtotal = agg._sum.totalCents ?? 0;
  await tx.order.update({ where: { id: orderId }, data: { subtotalCents: subtotal, totalCents: subtotal, discountCents: 0, feesCents: 0 } });
  return subtotal;
}

// Bloquea la cuenta mientras se le añade, quita o cobra algo: dos camareros a la
// vez no se pisan (el segundo espera y ve lo que hizo el primero).
async function lockOpen(tx: Tx, orderId: string, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { table: { select: { name: true } } } });
  if (!order || order.tenantId !== tenantId || !order.tableId) throw new TableError("Cuenta no encontrada");
  if (order.status !== "OPEN") throw new TableError("Esta mesa ya se ha cobrado o cerrado");
  return order;
}

async function nextOrderNumber(tx: Tx, tenantId: string): Promise<number> {
  const agg = await tx.order.aggregate({ where: { tenantId }, _max: { orderNumber: true } });
  return (agg._max.orderNumber ?? 0) + 1;
}

// Reintenta si dos pedidos cogen el mismo número a la vez.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const collision = err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2034" || (err.code === "P2002" && String(err.meta?.target ?? "").includes("orderNumber")));
      if (!collision || attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 30));
    }
  }
}

// Abre la cuenta de una mesa libre.
export async function openTable(tenantId: string, tableId: string, guests: number, userId: string, currency: string) {
  const table = await prisma.diningTable.findUnique({ where: { id: tableId } });
  if (!table || table.tenantId !== tenantId || !table.isActive) throw new TableError("Mesa no encontrada");
  const g = Math.max(1, Math.min(Math.floor(guests) || 1, MAX_GUESTS));
  try {
    return await withRetry(() =>
      prisma.$transaction(async (tx) => {
        const busy = await tx.order.findFirst({ where: { tableId, status: "OPEN" }, select: { id: true } });
        if (busy) throw new TableError(`La mesa ${table.name} ya está abierta`);
        return tx.order.create({
          data: {
            tenantId,
            storeId: table.storeId,
            orderNumber: await nextOrderNumber(tx, tenantId),
            channel: "TAKEAWAY",
            dineIn: true,
            source: "TABLE",
            status: "OPEN",
            paymentMethod: "IN_STORE",
            paymentStatus: "UNPAID",
            customerName: `Mesa ${table.name}`,
            customerPhone: "",
            currency,
            estimatedReadyAt: new Date(),
            tableId,
            guests: g,
            createdByUserId: userId,
          },
        });
      })
    );
  } catch (err) {
    // El índice único «una cuenta abierta por mesa» frena al segundo camarero.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && String(err.meta?.target ?? "").includes("tableId")) throw new TableError(`La mesa ${table.name} ya está abierta`);
    throw err;
  }
}

// Añade una ronda ya valorada (priceOrderItems) y descuenta su stock.
export async function addRound(
  tenantId: string,
  orderId: string,
  lines: Prisma.OrderLineCreateWithoutOrderInput[],
  consumption: ConsumptionItem[],
  userId: string
): Promise<{ round: number; totalCents: number }> {
  return prisma.$transaction(async (tx) => {
    await lockOpen(tx, orderId, tenantId);
    const last = await tx.orderLine.aggregate({ where: { orderId }, _max: { round: true } });
    const round = (last._max.round ?? 0) + 1;
    for (const l of lines) await tx.orderLine.create({ data: { ...l, round, addedByUserId: userId, order: { connect: { id: orderId } } } });
    if (consumption.length) {
      const used = await orderConsumption(tx, tenantId, consumption);
      await applyStockDeltas(tx, tenantId, new Map([...used].map(([id, q]) => [id, -q])), "ORDER", { orderId, note: `Ronda ${round}` });
    }
    const totalCents = await recompute(tx, orderId);
    return { round, totalCents };
  });
}

// Anula una línea ya enviada (solo el gerente). El stock no vuelve: en cocina
// puede estar hecho; la comanda de anulación avisa para que no lo preparen.
export async function voidLine(tenantId: string, orderId: string, lineId: string) {
  return prisma.$transaction(async (tx) => {
    await lockOpen(tx, orderId, tenantId);
    const line = await tx.orderLine.findUnique({ where: { id: lineId } });
    if (!line || line.orderId !== orderId) throw new TableError("Esa línea ya no está en la cuenta");
    await tx.orderLine.delete({ where: { id: lineId } });
    const totalCents = await recompute(tx, orderId);
    return { line, totalCents };
  });
}

export async function requestBill(tenantId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await lockOpen(tx, orderId, tenantId);
    const lines = await tx.orderLine.count({ where: { orderId } });
    if (!lines) throw new TableError("La cuenta está vacía");
    await tx.order.update({ where: { id: orderId }, data: { billRequestedAt: new Date() } });
    return order;
  });
}

// Cobra la cuenta entera o solo unas unidades (cuenta por separado). Lo cobrado
// por separado va a un pedido propio, ya pagado, con su factura. Devuelve el
// pedido cobrado y si la mesa queda libre.
export async function payTable(
  tenantId: string,
  orderId: string,
  opts: { method: PayMethod; cashTenderedCents: number | null; units: { lineId: string; qty: number }[] | null; userId: string }
): Promise<{ paidOrderId: string; orderNumber: number | null; totalCents: number; closed: boolean }> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const order = await lockOpen(tx, orderId, tenantId);
      const lines = await tx.orderLine.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
      if (!lines.length) throw new TableError("La cuenta está vacía");
      const byId = new Map(lines.map((l) => [l.id, l]));

      // ¿Por separado? Solo si no se cobra todo.
      const picks = new Map<string, number>();
      for (const u of opts.units ?? []) {
        const l = byId.get(u.lineId);
        if (!l) throw new TableError("Algo de la cuenta ha cambiado. Vuelve a elegir.");
        if (!Number.isInteger(u.qty) || u.qty < 1) continue;
        picks.set(l.id, Math.min((picks.get(l.id) ?? 0) + u.qty, l.quantity));
      }
      if (opts.units && !picks.size) throw new TableError("Elige qué se cobra");
      const all = lines.every((l) => picks.get(l.id) === l.quantity);
      const paidAt = new Date();
      const paid = { paymentStatus: "PAID" as const, paymentMethod: opts.method, paidAt, status: "DELIVERED" as const };

      if (!picks.size || all) {
        const total = lines.reduce((a, l) => a + l.totalCents, 0);
        if (opts.cashTenderedCents != null && opts.cashTenderedCents < total) throw new TableError("El efectivo entregado no llega al total");
        await recompute(tx, orderId);
        const done = await tx.order.update({ where: { id: orderId }, data: { ...paid, cashTenderedCents: opts.cashTenderedCents } });
        return { paidOrderId: done.id, orderNumber: done.orderNumber, totalCents: done.totalCents, closed: true };
      }

      // Cuenta por separado: un pedido nuevo de la misma mesa con lo elegido.
      let total = 0;
      const moves: { line: (typeof lines)[number]; qty: number; movedTotal: number; movedDiscount: number }[] = [];
      for (const [id, qty] of picks) {
        const line = byId.get(id)!;
        const { movedTotal, movedDiscount } = splitLineAmounts(line, qty);
        moves.push({ line, qty, movedTotal, movedDiscount });
        total += movedTotal;
      }
      if (opts.cashTenderedCents != null && opts.cashTenderedCents < total) throw new TableError("El efectivo entregado no llega al total");
      const part = await tx.order.create({
        data: {
          tenantId,
          storeId: order.storeId,
          orderNumber: await nextOrderNumber(tx, tenantId),
          channel: "TAKEAWAY",
          dineIn: true,
          source: "TABLE",
          customerName: order.customerName,
          customerPhone: "",
          currency: order.currency,
          estimatedReadyAt: paidAt,
          tableId: order.tableId,
          createdByUserId: opts.userId,
          notes: `Parte de la cuenta nº ${order.orderNumber ?? "?"}`,
          subtotalCents: total,
          totalCents: total,
          cashTenderedCents: opts.cashTenderedCents,
          ...paid,
        },
      });
      for (const m of moves) {
        if (m.qty === m.line.quantity) {
          await tx.orderLine.update({ where: { id: m.line.id }, data: { orderId: part.id } });
        } else {
          await tx.orderLine.update({
            where: { id: m.line.id },
            data: { quantity: m.line.quantity - m.qty, totalCents: m.line.totalCents - m.movedTotal, discountCents: m.line.discountCents - m.movedDiscount },
          });
          await tx.orderLine.create({
            data: {
              orderId: part.id,
              productId: m.line.productId,
              productName: m.line.productName,
              quantity: m.qty,
              basePriceCents: m.line.basePriceCents,
              totalCents: m.movedTotal,
              discountCents: m.movedDiscount,
              modifiers: m.line.modifiers as Prisma.InputJsonValue,
              note: m.line.note,
              round: m.line.round,
              addedByUserId: m.line.addedByUserId,
            },
          });
        }
      }
      await recompute(tx, orderId);
      return { paidOrderId: part.id, orderNumber: part.orderNumber, totalCents: total, closed: false };
    })
  );
}

// Pasa la cuenta a otra mesa libre del mismo local.
export async function moveTable(tenantId: string, orderId: string, toTableId: string) {
  const to = await prisma.diningTable.findUnique({ where: { id: toTableId } });
  if (!to || to.tenantId !== tenantId || !to.isActive) throw new TableError("Mesa no encontrada");
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await lockOpen(tx, orderId, tenantId);
      if (to.storeId !== order.storeId) throw new TableError("Esa mesa es de otro local");
      if (to.id === order.tableId) return order;
      const busy = await tx.order.findFirst({ where: { tableId: to.id, status: "OPEN" }, select: { id: true } });
      if (busy) throw new TableError(`La mesa ${to.name} está ocupada`);
      return tx.order.update({ where: { id: orderId }, data: { tableId: to.id, customerName: `Mesa ${to.name}` } });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new TableError(`La mesa ${to.name} está ocupada`);
    throw err;
  }
}
