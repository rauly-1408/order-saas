import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { selectionToModifiers, validateSelection, type MenuModifierGroup } from "@/app/lib/menuOptions";
import { applyStockDeltas, orderConsumption, type ConsumptionItem } from "@/app/lib/inventory";
import { getStoreOps, leadMinutes } from "@/app/lib/storeOps";
import { scheduleProblem } from "@/app/lib/schedule";
import { normalizePostalCode, zoneForPostalCode } from "@/app/lib/storeStatus";
import { customerPerkState, loadPerks } from "@/app/lib/perks";
import { bestPromotion, rewardDiscount, type CartLine } from "@/app/lib/promotions";
import { priceCombo, type ChoiceProduct, type ComboChoice } from "@/app/lib/combos";
import { computeSegment, couponDiscount, couponProblem, normalizeCode, normalizePhone, withinAttribution, ATTRIBUTION_DAYS } from "@/app/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// El cliente solo indica QUÉ pide; nombre y precios se toman de la base de
// datos (nunca del navegador, que se puede manipular).
type OrderLineInput = {
  productId: string;
  quantity: number;
  optionIds?: string[];
  comboChoices?: ComboChoice[]; // solo para combos: lo elegido en cada hueco
};

type OrderBody = {
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  customerPostalCode?: string;
  channel: "DELIVERY" | "TAKEAWAY";
  notes?: string;
  marketingConsent?: boolean;
  couponCode?: string;
  scheduledFor?: string; // ISO: pedido programado (también con la tienda cerrada)
  items: OrderLineInput[];
};

// Error de cupón detectado dentro de la transacción → 400 con el motivo.
class CouponError extends Error {}

const ORDER_NUMBER_RETRIES = 5;
const MAX_QTY_PER_LINE = 50;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Valida un teléfono español (móvil o fijo): 9 dígitos que empiezan en 6/7/8/9,
// con prefijo +34 / 0034 opcional. Última línea de defensa del CRM: aunque el
// checkout valide en cliente, un POST directo no pasa por ahí.
function isValidSpanishPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s-]/g, "");
  return /^(?:\+34|0034)?[6789]\d{8}$/.test(cleaned);
}

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const tenantSlug = segments[segments.length - 1];

    const body: OrderBody = await req.json();
    const {
      customerName,
      customerPhone,
      customerAddress,
      customerPostalCode,
      channel,
      notes,
      marketingConsent,
      couponCode,
      scheduledFor,
      items,
    } = body;

    if (!customerName?.trim() || !customerPhone?.trim() || !channel || !items?.length) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    if (!isValidSpanishPhone(customerPhone)) {
      return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
    }

    if (marketingConsent !== undefined && typeof marketingConsent !== "boolean") {
      return NextResponse.json({ error: "Consentimiento inválido" }, { status: 400 });
    }

    if (couponCode !== undefined && typeof couponCode !== "string") {
      return NextResponse.json({ error: "Cupón inválido" }, { status: 400 });
    }

    if (channel !== "DELIVERY" && channel !== "TAKEAWAY") {
      return NextResponse.json({ error: "Canal inválido" }, { status: 400 });
    }

    for (const item of items) {
      if (
        typeof item.productId !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > MAX_QTY_PER_LINE ||
        (item.optionIds !== undefined &&
          (!Array.isArray(item.optionIds) || item.optionIds.some((id) => typeof id !== "string"))) ||
        (item.comboChoices !== undefined &&
          (!Array.isArray(item.comboChoices) ||
            item.comboChoices.length > 10 ||
            item.comboChoices.some(
              (c) =>
                !c || typeof c.slotId !== "string" || typeof c.productId !== "string" ||
                (c.optionIds !== undefined && (!Array.isArray(c.optionIds) || c.optionIds.some((id) => typeof id !== "string")))
            )))
      ) {
        return NextResponse.json({ error: "Item inválido" }, { status: 400 });
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      include: { stores: { take: 1 } },
    });

    if (!tenant || !tenant.stores[0]) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const productIds = [...new Set(items.map((i) => i.productId))];
    const groupsSelect = {
      orderBy: { sortOrder: "asc" as const },
      select: {
        defaultOptionId: true,
        group: {
          select: {
            id: true,
            code: true,
            name: true,
            isRequired: true,
            minSelect: true,
            maxSelect: true,
            options: {
              where: { isAvailable: true, stockOut: false },
              orderBy: { sortOrder: "asc" as const },
              select: { id: true, name: true, priceDeltaCents: true },
            },
          },
        },
      },
    };
    const available = { tenantId: tenant.id, isActive: true, isAvailable: true, stockOut: false };
    const products = await prisma.product.findMany({
      where: { ...available, id: { in: productIds } },
      select: {
        id: true,
        name: true,
        basePriceCents: true,
        categoryId: true,
        isCombo: true,
        comboSlots: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, items: { select: { productId: true, extraCents: true } } } },
        modifierGroups: groupsSelect,
      },
    });

    // Productos elegidos dentro de los combos (tienen que estar disponibles).
    const choiceIds = [...new Set(items.flatMap((i) => (i.comboChoices ?? []).map((c) => c.productId)))];
    const choiceProducts = choiceIds.length
      ? await prisma.product.findMany({ where: { ...available, isCombo: false, id: { in: choiceIds } }, select: { id: true, name: true, modifierGroups: groupsSelect } })
      : [];
    const choiceById = new Map<string, ChoiceProduct>(
      choiceProducts.map((p) => [p.id, { id: p.id, name: p.name, modifierGroups: p.modifierGroups.map((pmg) => ({ ...pmg.group, defaultOptionId: pmg.defaultOptionId })) }])
    );

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { error: "Algún producto ya no está disponible. Revisa tu pedido." },
        { status: 400 }
      );
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    const store = tenant.stores[0];
    // Operativa del local (horario, cierres, pausa, zonas): la referencia es Store.
    const ops = await getStoreOps(tenant.id, tenant.settings);
    if (!ops) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    // Programado: la hora tiene que caer en horario y dar tiempo a prepararlo.
    // Sin programar, la tienda tiene que estar abierta ahora.
    if (scheduledFor !== undefined && typeof scheduledFor !== "string") {
      return NextResponse.json({ error: "Hora programada no válida" }, { status: 400 });
    }
    const scheduledAt = scheduledFor ? new Date(scheduledFor) : null;
    if (scheduledAt) {
      const problem = scheduleProblem({ hours: ops.hours, closures: ops.closures, pausedUntil: ops.pausedUntil }, scheduledAt, new Date(), ops.timeZone, leadMinutes(ops, channel));
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    } else if (!ops.status.open) {
      const when = ops.status.reopens ? ` Volvemos a abrir ${ops.status.reopens}.` : "";
      return NextResponse.json({ error: `${ops.status.message}.${when}`, closed: true }, { status: 409 });
    }
    if (channel === "DELIVERY" && !ops.deliveryEnabled) {
      return NextResponse.json({ error: "Delivery no disponible" }, { status: 400 });
    }
    if (channel === "TAKEAWAY" && !ops.takeawayEnabled) {
      return NextResponse.json({ error: "Recogida no disponible" }, { status: 400 });
    }

    // Reparto: si hay zonas activas, el código postal decide coste y mínimo.
    const postalCode = customerPostalCode ? normalizePostalCode(customerPostalCode) : "";
    let deliveryFeeCents = ops.deliveryFeeCents;
    let minimumOrderCents = ops.minimumOrderCents;
    const activeZones = ops.zones.filter((z) => z.active);
    if (channel === "DELIVERY" && activeZones.length) {
      if (postalCode.length !== 5) return NextResponse.json({ error: "Indica el código postal de la entrega" }, { status: 400 });
      const zone = zoneForPostalCode(activeZones, postalCode);
      if (!zone) return NextResponse.json({ error: `No repartimos en el código postal ${postalCode}. Puedes pedir para recoger.` }, { status: 400 });
      deliveryFeeCents = zone.feeCents;
      minimumOrderCents = zone.minOrderCents;
    }

    // Precio de cada línea = precio base + suplementos de las opciones elegidas.
    const linesCreate: Prisma.OrderLineCreateWithoutOrderInput[] = [];
    const cartLines: CartLine[] = [];
    const consumption: ConsumptionItem[] = [];
    for (const item of items) {
      const product = productById.get(item.productId)!;
      // Combo: precio cerrado + suplementos; el stock sale de lo elegido.
      if (product.isCombo) {
        const choices = (item.comboChoices ?? []).map((c) => ({ ...c, optionIds: c.optionIds ?? [] }));
        const priced = priceCombo({ name: product.name, basePriceCents: product.basePriceCents, slots: product.comboSlots }, choices, choiceById);
        if (typeof priced === "string") return NextResponse.json({ error: priced }, { status: 400 });
        cartLines.push({ key: String(cartLines.length), categoryId: product.categoryId, unitBaseCents: product.basePriceCents, quantity: item.quantity });
        for (const c of choices) consumption.push({ productId: c.productId, quantity: item.quantity, optionIds: c.optionIds });
        linesCreate.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          basePriceCents: product.basePriceCents,
          modifiers: priced.modifiers as unknown as Prisma.InputJsonValue,
          totalCents: priced.unitCents * item.quantity,
        });
        continue;
      }
      const groups: MenuModifierGroup[] = product.modifierGroups.map((pmg) => ({
        ...pmg.group,
        defaultOptionId: pmg.defaultOptionId,
      }));

      const selection: Record<string, string[]> = {};
      for (const g of groups) selection[g.id] = [];
      for (const optionId of new Set(item.optionIds ?? [])) {
        const group = groups.find((g) => g.options.some((o) => o.id === optionId));
        if (!group) {
          return NextResponse.json({ error: `${product.name}: opción no válida` }, { status: 400 });
        }
        selection[group.id].push(optionId);
      }

      const selectionError = validateSelection(groups, selection);
      if (selectionError) {
        return NextResponse.json({ error: `${product.name} — ${selectionError}` }, { status: 400 });
      }

      const modifiers = selectionToModifiers(groups, selection);
      const unitCents = product.basePriceCents + modifiers.reduce((acc, m) => acc + m.priceDeltaCents, 0);
      cartLines.push({ key: String(cartLines.length), categoryId: product.categoryId, unitBaseCents: product.basePriceCents, quantity: item.quantity });
      consumption.push({ productId: product.id, quantity: item.quantity, optionIds: Object.values(selection).flat() });
      linesCreate.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        basePriceCents: product.basePriceCents,
        modifiers: modifiers as unknown as Prisma.InputJsonValue,
        totalCents: unitCents * item.quantity,
      });
    }

    const subtotalCents = linesCreate.reduce((acc, line) => acc + (line.totalCents ?? 0), 0);
    const feesCents = channel === "DELIVERY" ? deliveryFeeCents : 0;
    // Pedido mínimo: solo a domicilio.
    if (channel === "DELIVERY" && subtotalCents < minimumOrderCents) {
      const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(minimumOrderCents / 100);
      return NextResponse.json({ error: `El pedido mínimo a domicilio es de ${eur}` }, { status: 400 });
    }

    // Descuentos (motor de retención): 1) premio de la tarjeta de fidelidad,
    // 2) la mejor promoción automática O el cupón — no se acumulan, gana el que más ahorra.
    const perks = await loadPerks(tenant.id, tenant.settings, tenant.addons);
    const state = await customerPerkState(prisma, tenant.id, customerPhone, perks.loyalty);
    let loyaltyDiscountCents = 0;
    if (perks.loyalty && state.loyalty?.rewardAvailable) {
      loyaltyDiscountCents = rewardDiscount(perks.loyalty, cartLines).discountCents;
    }
    const afterLoyalty = subtotalCents - loyaltyDiscountCents;
    const promo = bestPromotion(perks.promotions, { subtotalCents: afterLoyalty, feesCents, channel, firstOrder: state.firstOrder });

    const code = couponCode ? normalizeCode(couponCode) : "";
    let coupon: { id: string; oncePerCustomer: boolean; maxRedemptions: number | null } | null = null;
    let couponDiscountCents = 0;
    if (code) {
      const found = tenant.addons.includes("RETENTION")
        ? await prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } })
        : null;
      if (!found) return NextResponse.json({ error: "Ese cupón no existe" }, { status: 400 });
      const problem = couponProblem(found, subtotalCents);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      coupon = { id: found.id, oncePerCustomer: found.oncePerCustomer, maxRedemptions: found.maxRedemptions };
      couponDiscountCents = couponDiscount(found, afterLoyalty);
    }
    // Si la promoción ahorra más que el cupón, el cupón no se gasta.
    const usePromo = promo && promo.discountCents > couponDiscountCents;
    if (usePromo) {
      coupon = null;
      couponDiscountCents = 0;
    }
    const promotionDiscountCents = usePromo ? promo.discountCents : 0;
    const discountCents = Math.min(loyaltyDiscountCents + promotionDiscountCents + couponDiscountCents, subtotalCents + feesCents);
    const totalCents = subtotalCents + feesCents - discountCents;
    const settings = tenant.settings as Record<string, unknown>;
    const currency = (settings?.currency as string) ?? "EUR";

    let order: Awaited<ReturnType<typeof createOrderWithNumber>> | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < ORDER_NUMBER_RETRIES; attempt++) {
      try {
        order = await createOrderWithNumber({
          tenantId: tenant.id,
          storeId: store.id,
          channel,
          customerName,
          customerPhone,
          customerAddress: customerAddress ?? null,
          customerPostalCode: postalCode || null,
          notes: notes ?? null,
          marketingConsent: marketingConsent === true,
          currency,
          subtotalCents,
          feesCents,
          discountCents,
          totalCents,
          coupon,
          promotionId: usePromo ? promo.promotion.id : null,
          promotionDiscountCents,
          loyaltyDiscountCents,
          estimatedReadyAt: scheduledAt ?? new Date(Date.now() + 60_000 * leadMinutes(ops, channel)),
          scheduledFor: scheduledAt,
          retention: tenant.addons.includes("RETENTION"),
          lines: linesCreate,
          // Inventario (módulo Costes): solo si el restaurante lo tiene contratado
          consumption: tenant.addons.includes("COSTS") ? consumption : [],
        });
        break;
      } catch (err) {
        if (err instanceof CouponError) return NextResponse.json({ error: err.message }, { status: 400 });
        lastError = err;
        const isCollision =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === "P2002" || err.code === "P2034");
        if (!isCollision || attempt === ORDER_NUMBER_RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, 10 + Math.random() * 30));
      }
    }

    if (!order) throw lastError ?? new Error("No se pudo crear el pedido");

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      estimatedMinutes:
        channel === "DELIVERY"
          ? ops.estimatedDeliveryMinutes + ops.prepExtraMinutes
          : ops.estimatedPickupMinutes + ops.prepExtraMinutes,
    });
  } catch (err) {
    console.error("[POST /api/orders]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

type CreateOrderInput = {
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
  retention: boolean;
  lines: Prisma.OrderLineCreateWithoutOrderInput[];
  consumption: ConsumptionItem[];
};

async function createOrderWithNumber(input: CreateOrderInput) {
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

    const existing = await tx.customer.findUnique({
      where: { tenantId_phone: { tenantId: input.tenantId, phone } },
      select: {
        id: true,
        ordersCount: true,
        totalSpentCents: true,
        firstOrderAt: true,
        marketingConsent: true,
      },
    });

    const newOrdersCount = (existing?.ordersCount ?? 0) + 1;
    const newTotalSpent = (existing?.totalSpentCents ?? 0) + input.totalCents;
    const segment = computeSegment(newOrdersCount, newTotalSpent, now, now);

    // Consentimiento: solo se CONCEDE desde el checkout (opt-in explícito).
    // Desmarcar la casilla en un pedido posterior no lo revoca — la baja va por
    // su propio flujo. marketingConsentAt guarda cuándo se dio (prueba RGPD).
    const grantConsent = input.marketingConsent && !existing?.marketingConsent;

    const customer = await tx.customer.upsert({
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
        // Actualizamos el nombre por si lo cambió; el teléfono es la clave estable.
        name: input.customerName,
        ordersCount: newOrdersCount,
        totalSpentCents: newTotalSpent,
        lastOrderAt: now,
        segment,
        ...(grantConsent && { marketingConsent: true, marketingConsentAt: now }),
      },
      select: { id: true },
    });

    // Cupón: un uso por teléfono (si así se creó) y tope de usos atómico.
    if (input.coupon) {
      if (input.coupon.oncePerCustomer && existing) {
        const used = await tx.order.count({ where: { couponId: input.coupon.id, customerId: customer.id, status: { not: "CANCELLED" } } });
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

    const order = await tx.order.create({
      data: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        customerId: customer.id,
        orderNumber,
        channel: input.channel,
        status: "CREATED",
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
    if (input.retention && existing) {
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const tenantSlug = segments[segments.length - 1];

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    // Los pedidos contienen PII (nombre, teléfono, dirección): solo el dueño
    // autenticado de este tenant —o un SUPERADMIN— puede leerlos.
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    }

    const orders = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["CREATED", "ACCEPTED", "PREPARING", "READY", "DELIVERING"] },
      },
      include: { items: true, coupon: { select: { code: true } }, promotion: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    // Historial reciente (entregados/cancelados) para la sección plegada del panel.
    const since = new Date(Date.now() - HISTORY_WINDOW_MS);
    const history = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["DELIVERED", "CANCELLED"] },
        updatedAt: { gte: since },
      },
      include: { items: true, coupon: { select: { code: true } }, promotion: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Tiempos estimados (con el tiempo extra) y estado de la tienda para la cabecera.
    const ops = await getStoreOps(tenant.id, tenant.settings);

    return NextResponse.json({
      orders,
      history,
      estimates: {
        deliveryMinutes: (ops?.estimatedDeliveryMinutes ?? 45) + (ops?.prepExtraMinutes ?? 0),
        pickupMinutes: (ops?.estimatedPickupMinutes ?? 20) + (ops?.prepExtraMinutes ?? 0),
      },
      store: ops ? { status: ops.status, pausedUntil: ops.pausedUntil, prepExtraMinutes: ops.prepExtraMinutes } : null,
    });
  } catch (err) {
    console.error("[GET /api/orders]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
