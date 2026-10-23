import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { applyStockDeltas, orderConsumption, type ConsumptionItem } from "@/app/lib/inventory";
import { computeSegment, normalizePhone, withinAttribution, ATTRIBUTION_DAYS } from "@/app/lib/retention";

// Crea el pedido con su número correlativo dentro de una transacción: CRM,
// cupón, tarjeta regalo, atribución de campañas y stock, todo o nada. Lo usan
// la tienda (POST /api/orders) y la Caja del panel. Ver docs/CAJA.md

// Error de cupón detectado dentro de la transacción → 400 con el motivo.
export class CouponError extends Error {}

export type CreateOrderInput = {
  tenantId: string;
  storeId: string;
  channel: "DELIVERY" | "TAKEAWAY";
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  customerPostalCode: string | null;
  notes: string | null;
  marketingConsent: boolean;
  currency: string;
  subtotalCents: number;
  feesCents: number;
  discountCents: number;
  totalCents: number;
  coupon: { id: string; oncePerCustomer: boolean; maxRedemptions: number | null } | null;
  promotionId: string | null;
  promotionDiscountCents: number;
  loyaltyDiscountCents: number;
  estimatedReadyAt: Date;
  scheduledFor: Date | null;
  payment: { method: "IN_STORE" | "CARD" | "BIZUM" | "CASH" | "CARD_TERMINAL"; provider: string | null; paid?: boolean };
  // Caja: origen del pedido, «para comer aquí», quién lo tomó y efectivo entregado.
  source?: "ONLINE" | "COUNTER" | "PHONE";
  dineIn?: boolean;
  createdByUserId?: string | null;
  cashTenderedCents?: number | null;
  tipCents: number;
  giftCard: { id: string; cents: number } | null;
  retention: boolean;
  lines: Prisma.OrderLineCreateWithoutOrderInput[];
  consumption: ConsumptionItem[];
};

export async function createOrderWithNumber(input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    const orderNumberAgg = await tx.order.aggregate({
      where: { tenantId: input.tenantId },
      _max: { orderNumber: true },
    });
    const orderNumber = (orderNumberAgg._max.orderNumber ?? 0) + 1;

    // ── CRM: upsert del Customer por (tenant, teléfono) ──────────────────
    // Se hace dentro de la transacción del pedido: si el pedido falla, el
    // cliente no queda actualizado a medias.
    const phone = normalizePhone(input.customerPhone);
    const now = new Date();

    // Sin teléfono (pedido de mostrador anónimo) no se toca el CRM.
    const existing = phone ? await tx.customer.findUnique({
      where: { tenantId_phone: { tenantId: input.tenantId, phone } },
      select: {
        id: true,
        ordersCount: true,
        totalSpentCents: true,
        firstOrderAt: true,
        marketingConsent: true,
      },
    }) : null;

    const newOrdersCount = (existing?.ordersCount ?? 0) + 1;
    const newTotalSpent = (existing?.totalSpentCents ?? 0) + input.totalCents;
    const segment = computeSegment(newOrdersCount, newTotalSpent, now, now);

    // Consentimiento: solo se CONCEDE desde el checkout (opt-in explícito).
    // Desmarcar la casilla en un pedido posterior no lo revoca — la baja va por
    // su propio flujo. marketingConsentAt guarda cuándo se dio (prueba RGPD).
    const grantConsent = input.marketingConsent && !existing?.marketingConsent;

    const customer = phone ? await tx.customer.upsert({
      where: { tenantId_phone: { tenantId: input.tenantId, phone } },
      create: {
        tenantId: input.tenantId,
        phone,
        name: input.customerName,
        ordersCount: 1,
        totalSpentCents: input.totalCents,
        firstOrderAt: now,
        lastOrderAt: now,
        segment, // será NEW en el primer pedido
        marketingConsent: input.marketingConsent,
        marketingConsentAt: input.marketingConsent ? now : null,
      },
      update: {
        // El nombre guardado no se pisa desde un pedido público: cualquiera
        // podría escribir otro nombre con el teléfono de un cliente.
        ordersCount: newOrdersCount,
        totalSpentCents: newTotalSpent,
        lastOrderAt: now,
        segment,
        ...(grantConsent && { marketingConsent: true, marketingConsentAt: now }),
      },
      select: { id: true },
    }) : null;

    // Cupón: un uso por teléfono (si así se creó) y tope de usos atómico.
    if (input.coupon) {
      if (input.coupon.oncePerCustomer && existing) {
        const used = await tx.order.count({ where: { couponId: input.coupon.id, customerId: (customer?.id ?? null), status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } } });
        if (used > 0) throw new CouponError("Ya has usado este cupón");
      }
      const claimed = await tx.coupon.updateMany({
        where: {
          id: input.coupon.id,
          ...(input.coupon.maxRedemptions != null && { redeemedCount: { lt: input.coupon.maxRedemptions } }),
        },
        data: { redeemedCount: { increment: 1 } },
      });
      if (claimed.count === 0) throw new CouponError("Este cupón ya se ha agotado");
    }

    // Tarjeta regalo: se descuenta el saldo de forma atómica (dos pedidos a la vez no la gastan dos veces).
    if (input.giftCard) {
      const claimed = await tx.giftCard.updateMany({
        where: { id: input.giftCard.id, active: true, balanceCents: { gte: input.giftCard.cents } },
        data: { balanceCents: { decrement: input.giftCard.cents } },
      });
      if (claimed.count === 0) throw new CouponError("La tarjeta regalo ya no tiene ese saldo. Vuelve a aplicarla.");
    }

    const order = await tx.order.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        customerId: (customer?.id ?? null),
        orderNumber,
        channel: input.channel,
        source: input.source ?? "ONLINE",
        dineIn: input.dineIn ?? false,
        createdByUserId: input.createdByUserId ?? null,
        cashTenderedCents: input.cashTenderedCents ?? null,
        // Pago online: espera a que la pasarela lo confirme (no llega a la cocina).
        // Cobrado en caja (paid) o «pagar al recoger»: a cocina directamente.
        status: input.payment.method === "IN_STORE" || input.payment.paid ? "CREATED" : "AWAITING_PAYMENT",
        paymentMethod: input.payment.method,
        paymentStatus: input.payment.paid ? "PAID" : input.payment.method === "IN_STORE" ? "UNPAID" : "PENDING",
        paymentProvider: input.payment.provider,
        tipCents: input.tipCents,
        giftCardId: input.giftCard?.id ?? null,
        giftCardCents: input.giftCard?.cents ?? 0,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress,
        customerPostalCode: input.customerPostalCode,
        notes: input.notes,
        currency: input.currency,
        subtotalCents: input.subtotalCents,
        feesCents: input.feesCents,
        discountCents: input.discountCents,
        totalCents: input.totalCents,
        couponId: input.coupon?.id ?? null,
        promotionId: input.promotionId,
        promotionDiscountCents: input.promotionDiscountCents,
        loyaltyReward: input.loyaltyDiscountCents > 0,
        loyaltyDiscountCents: input.loyaltyDiscountCents,
        estimatedReadyAt: input.estimatedReadyAt,
        scheduledFor: input.scheduledFor,
        items: { create: input.lines },
      },
      include: { items: true },
    });

    // Atribución: si el cliente recibió una campaña hace poco, ese envío se
    // marca como convertido. Gana la campaña del cupón usado; si no, la última.
    if (input.retention && existing && customer) {
      const since = new Date(now.getTime() - ATTRIBUTION_DAYS * 86_400_000);
      const sends = await tx.campaignSend.findMany({
        where: { customerId: customer.id, status: "SENT", sentAt: { gte: since } },
        orderBy: { sentAt: "desc" },
        select: { id: true, sentAt: true, campaign: { select: { couponId: true } } },
      });
      const match =
        (input.coupon && sends.find((s) => s.campaign.couponId === input.coupon!.id)) ||
        sends.find((s) => s.sentAt && withinAttribution(s.sentAt, now));
      if (match) {
        await tx.campaignSend.update({
          where: { id: match.id },
          data: { status: "CONVERTED", convertedAt: now, convertedOrderId: order.id },
        });
      }
    }

    // Descuento de stock en la misma transacción: si falla, no hay pedido.
    if (input.consumption.length) {
      const used = await orderConsumption(tx, input.tenantId, input.consumption);
      const deltas = new Map([...used].map(([id, qty]) => [id, -qty]));
      await applyStockDeltas(tx, input.tenantId, deltas, "ORDER", { orderId: order.id });
    }

    return order;
  });
}
