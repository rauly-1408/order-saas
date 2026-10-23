// Pago online con la pasarela del restaurante. Un pedido pagado online nace en
// AWAITING_PAYMENT: no llega a la cocina, no suena y no cuenta en informes
// hasta que la pasarela confirma el pago. Si falla o se abandona, se deshace
// (stock, cupón, compras del cliente, campaña) y queda cancelado.
// Ver docs/PAGOS.md
import type { Order, Prisma } from "@prisma/client";
import { after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { notifyNewOrder } from "@/app/lib/notifyOrder";
import { printOnNewOrder } from "@/app/lib/printing";
import { issueInvoiceSafe } from "@/app/lib/verifactu";
import { unseal } from "@/app/lib/secretBox";
import { returnOrderStock } from "@/app/lib/inventory";
import { platformFeeCents } from "@/app/lib/payments";
import { restoreGiftCard } from "@/app/lib/giftCards";
import { testGateway } from "./test";
import { stripeGateway } from "./stripe";
import { redsysGateway } from "./redsys";
import { GATEWAYS, GatewayError, type Gateway, type GatewayContext, type GatewayId, type OnlineMethod, type PaymentOrder, type PaymentOutcome, type PaymentStart } from "./types";

export const SECRETS_PURPOSE = "payment-secrets-v1";
const IMPL: Partial<Record<GatewayId, Gateway>> = { TEST: testGateway, STRIPE: stripeGateway, REDSYS: redsysGateway };
// Tras este tiempo sin confirmar, el pedido se da por abandonado.
export const PAYMENT_TIMEOUT_MS = 45 * 60_000;

export const asGateway = (v: unknown): GatewayId => (GATEWAYS.includes(v as GatewayId) ? (v as GatewayId) : "NONE");

export async function paymentAccount(tenantId: string) {
  const row = await prisma.paymentAccount.findUnique({ where: { tenantId } });
  const provider = asGateway(row?.provider);
  // Cada pasarela recibe su clave como «secretKey» (se guardan por separado
  // para no perderlas al cambiar de una a otra).
  const stored = unseal(row?.secrets, SECRETS_PURPOSE);
  const secrets: Record<string, string> =
    provider === "STRIPE" ? { secretKey: stored.stripeKey ?? "", webhookSecret: stored.stripeWebhook ?? "" } : provider === "REDSYS" ? { secretKey: stored.redsysKey ?? "" } : {};
  const ctx: GatewayContext = { tenantId, config: (row?.config ?? {}) as Record<string, unknown>, secrets };
  return { row, provider, ctx, impl: IMPL[provider] ?? null };
}

// Qué formas de pago ve el cliente en el checkout.
export type PaymentOptions = { card: boolean; bizum: boolean; inStore: boolean; test: boolean };
export async function paymentOptions(tenantId: string): Promise<PaymentOptions> {
  const row = await prisma.paymentAccount.findUnique({ where: { tenantId }, select: { provider: true, bizum: true, payInStore: true } });
  const provider = asGateway(row?.provider);
  const online = provider !== "NONE";
  return { card: online, bizum: provider === "REDSYS" && !!row?.bizum, inStore: !online || (row?.payInStore ?? true), test: provider === "TEST" };
}

const toPaymentOrder = (o: Pick<Order, "id" | "orderNumber" | "totalCents" | "paymentRef">, tenantName: string, lang: "es" | "en"): PaymentOrder => ({
  id: o.id,
  orderNumber: o.orderNumber,
  totalCents: o.totalCents,
  paymentRef: o.paymentRef,
  tenantName,
  lang,
});

export function paymentUrls(origin: string, slug: string, orderId: string) {
  const base = `${origin}/pedir/${slug}/pago/${orderId}`;
  return { returnUrl: `${base}/vuelta`, cancelUrl: `${base}/vuelta?cancelled=1`, notifyUrl: `${origin}/api/webhooks/payments/${slug}` };
}

// Lleva al cliente a pagar. Si la pasarela falla, el pedido se deshace.
export async function startPayment(orderId: string, method: OnlineMethod, origin: string, lang: "es" | "en"): Promise<PaymentStart> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { tenant: { select: { name: true, slug: true } } } });
  const account = await paymentAccount(order.tenantId);
  if (!account.impl) throw new GatewayError("Este restaurante no tiene pago online");
  try {
    const start = await account.impl.start(toPaymentOrder(order, order.tenant.name, lang), method, paymentUrls(origin, order.tenant.slug, order.id), account.ctx);
    await prisma.order.update({ where: { id: order.id }, data: { paymentRef: start.ref } });
    return start;
  } catch (err) {
    await finalizePayment(order.id, { status: "FAILED" });
    if (err instanceof GatewayError) throw err;
    console.error("[startPayment]", err);
    throw new GatewayError("No se ha podido abrir el pago. Inténtalo de nuevo.");
  }
}

// Deshace lo que hizo crear el pedido (dentro de una transacción).
async function undoUnpaidOrder(tx: Prisma.TransactionClient, order: Order) {
  await returnOrderStock(tx, order.tenantId, order.id);
  if (order.customerId) {
    await tx.customer.updateMany({
      where: { id: order.customerId, ordersCount: { gt: 0 } },
      data: { ordersCount: { decrement: 1 }, totalSpentCents: { decrement: order.totalCents } },
    });
  }
  if (order.couponId) await tx.coupon.updateMany({ where: { id: order.couponId, redeemedCount: { gt: 0 } }, data: { redeemedCount: { decrement: 1 } } });
  await tx.campaignSend.updateMany({ where: { convertedOrderId: order.id }, data: { status: "SENT", convertedAt: null, convertedOrderId: null } });
  await restoreGiftCard(tx, order);
}

// Aplica el resultado del pago. Idempotente: solo actúa si el pedido sigue
// esperando el pago (los avisos repetidos no hacen nada).
export async function finalizePayment(orderId: string, outcome: PaymentOutcome): Promise<Order | null> {
  if (outcome.status === "PENDING") return prisma.order.findUnique({ where: { id: orderId } });
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { tenant: { select: { platformFeeBps: true } } } });
    if (!order || order.status !== "AWAITING_PAYMENT") return order;
    if (outcome.status === "PAID") {
      const paid = await tx.order.update({
        where: { id: orderId },
        data: {
          status: "CREATED",
          paymentStatus: "PAID",
          paidAt: new Date(),
          paymentRef: outcome.ref ?? order.paymentRef,
          applicationFeeCents: platformFeeCents(order.totalCents, order.tenant.platformFeeBps),
        },
      });
      // Ya pagado: ahora sí avisamos al restaurante (después de responder).
      after(() => Promise.all([notifyNewOrder(paid.id), issueInvoiceSafe(paid.id).then(() => printOnNewOrder(paid.id))]));
      return paid;
    }
    await undoUnpaidOrder(tx, order);
    return tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledBy: "SYSTEM" } });
  });
}

// Comprueba el pago con lo que trae la vuelta del cliente o el aviso de la pasarela.
export async function verifyPayment(orderId: string, params: Record<string, string>): Promise<Order | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { tenant: { select: { name: true } } } });
  if (!order || order.status !== "AWAITING_PAYMENT") return order;
  const account = await paymentAccount(order.tenantId);
  const impl = IMPL[asGateway(order.paymentProvider)];
  if (!impl) return order;
  try {
    const outcome = await impl.verify(toPaymentOrder(order, order.tenant.name, "es"), params, account.ctx);
    return await finalizePayment(order.id, outcome);
  } catch (err) {
    console.error("[verifyPayment]", err);
    return order;
  }
}

// Pagos sin confirmar desde hace demasiado: se consulta una última vez y, si
// no, se cancelan (se llama al refrescar el panel de pedidos).
export async function expireStalePayments(tenantId: string): Promise<void> {
  const stale = await prisma.order.findMany({
    where: { tenantId, status: "AWAITING_PAYMENT", createdAt: { lt: new Date(Date.now() - PAYMENT_TIMEOUT_MS) } },
    select: { id: true },
    take: 20,
  });
  for (const o of stale) {
    const after = await verifyPayment(o.id, {});
    if (after?.status === "AWAITING_PAYMENT") await finalizePayment(o.id, { status: "FAILED" });
  }
}

// Devuelve el dinero de un pedido pagado online (al cancelarlo desde el panel).
// Devuelve un mensaje si la pasarela no lo acepta, para avisar al restaurante.
export async function refundOrder(orderId: string): Promise<string | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { tenant: { select: { name: true } } } });
  if (!order || order.paymentStatus !== "PAID" || order.paymentMethod === "IN_STORE") return null;
  // Cobrado en caja (efectivo, datáfono o Bizum en el local): no hay pasarela
  // a la que pedir la devolución; se marca y el dinero se devuelve en mano.
  if (!order.paymentProvider || order.paymentMethod === "CASH" || order.paymentMethod === "CARD_TERMINAL") {
    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUNDED" } });
    return order.paymentMethod === "CASH" ? "Devuelve el efectivo al cliente en caja." : "Devuélvelo desde el datáfono o por Bizum.";
  }
  const impl = IMPL[asGateway(order.paymentProvider)];
  const account = await paymentAccount(order.tenantId);
  try {
    if (!impl) throw new GatewayError("La pasarela de este pedido ya no está conectada");
    await impl.refund(toPaymentOrder(order, order.tenant.name, "es"), account.ctx);
    await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUNDED" } });
    return null;
  } catch (err) {
    if (!(err instanceof GatewayError)) console.error("[refundOrder]", err);
    const msg = err instanceof GatewayError ? err.message : "No se ha podido devolver el pago";
    return `${msg}. Devuélvelo desde el panel de tu pasarela.`;
  }
}
