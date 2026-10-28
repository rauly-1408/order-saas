import { NextRequest, NextResponse, after } from "next/server";
import { notifyNewOrder } from "@/app/lib/notifyOrder";
import { printOnNewOrder, readPrinting } from "@/app/lib/printing";
import { issueInvoiceSafe } from "@/app/lib/verifactu";
import { cleanText } from "@/app/lib/text";
import { rateLimit } from "@/app/lib/rateLimit";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { customerProven, withCustomerProof } from "@/app/lib/customerProof";
import { syncCourier, toPublicCourier } from "@/app/lib/couriers";
import { ACTIVE_STATUSES } from "@/app/lib/couriers/types";
import { listStores, resolveStoreId } from "@/app/lib/stores";
import { readCheckout, tipCents } from "@/app/lib/storePolicies";
import { usableGiftCard } from "@/app/lib/giftCards";
import { expireStalePayments, paymentAccount, paymentOptions, startPayment } from "@/app/lib/gateways";
import { GatewayError, type OnlineMethod } from "@/app/lib/gateways/types";
import { getSessionFromRequest } from "@/app/lib/auth";
import { getStoreOps, leadMinutes } from "@/app/lib/storeOps";
import { scheduleProblem } from "@/app/lib/schedule";
import { normalizePostalCode, zoneForPostalCode } from "@/app/lib/storeStatus";
import { customerPerkState, loadPerks } from "@/app/lib/perks";
import { bestPromotion, rewardDiscount } from "@/app/lib/promotions";
import { couponDiscount, couponProblem, normalizeCode } from "@/app/lib/retention";
import { MAX_QTY_PER_LINE, priceOrderItems, type OrderLineInput } from "@/app/lib/orderPricing";
import { CouponError, createOrderWithNumber } from "@/app/lib/createOrder";
import { bestDiscount, collaboratorByCode, collaboratorDiscountCents, commissionCents } from "@/app/lib/collaborators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  paymentMethod?: "IN_STORE" | "CARD" | "BIZUM"; // CARD/BIZUM = pago online con la pasarela del restaurante
  lang?: "es" | "en";
  storeId?: string; // sucursales: local elegido por el cliente
  tipPercent?: number; // propina (Configuración → Pantalla de pago)
  giftCardCode?: string; // tarjeta regalo
  collaboratorCode?: string; // código de un colaborador (RRPP, hotel…): se lleva su %
  items: OrderLineInput[];
};

const ORDER_NUMBER_RETRIES = 5;
const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Valida un teléfono español (móvil o fijo): 9 dígitos que empiezan en 6/7/8/9,
// con prefijo +34 / 0034 opcional. Última línea de defensa del CRM: aunque el
// checkout valide en cliente, un POST directo no pasa por ahí.
function isValidSpanishPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s-]/g, "");
  return /^(?:\+34|0034)?[6789]\d{8}$/.test(cleaned);
}

export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, "orders", 12, 60);
  if (limited) return limited;
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/");
    const tenantSlug = segments[segments.length - 1];

    const body: OrderBody = await req.json();
    // Texto del cliente: sin caracteres de control y con largo máximo (sale en
    // la comanda impresa y en el panel). Ver lib/text.ts
    body.customerName = cleanText(body.customerName, 80);
    body.customerAddress = cleanText(body.customerAddress, 200) || undefined;
    body.customerPostalCode = cleanText(body.customerPostalCode, 10) || undefined;
    body.notes = cleanText(body.notes, 300) || undefined;
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
      paymentMethod = "IN_STORE",
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

    if (paymentMethod !== "IN_STORE" && paymentMethod !== "CARD" && paymentMethod !== "BIZUM") {
      return NextResponse.json({ error: "Forma de pago inválida" }, { status: 400 });
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

    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    // Sucursales: el local elegido por el cliente (abierto al público) o el primero.
    const storeId = tenant ? await resolveStoreId(tenant.id, body.storeId, { activeOnly: true }) : null;
    if (!tenant || !storeId) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    // Forma de pago: solo las que el restaurante tiene activadas.
    const payOpts = await paymentOptions(tenant.id);
    const online = paymentMethod !== "IN_STORE";
    if ((paymentMethod === "IN_STORE" && !payOpts.inStore) || (paymentMethod === "CARD" && !payOpts.card) || (paymentMethod === "BIZUM" && !payOpts.bizum)) {
      return NextResponse.json({ error: "Esa forma de pago no está disponible" }, { status: 400 });
    }
    const payment = { method: paymentMethod, provider: online ? (await paymentAccount(tenant.id)).provider : null };


    // Precio de cada línea (base + opciones + menús) con datos de la base de datos.
    const priced = await priceOrderItems(tenant.id, items, { online: true });
    if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 400 });
    const { linesCreate, cartLines, consumption, subtotalCents } = priced;

    // Operativa del local (horario, cierres, pausa, zonas): la referencia es Store.
    const ops = await getStoreOps(tenant.id, tenant.settings, new Date(), storeId);
    if (!ops) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    // Programado: la hora tiene que caer en horario y dar tiempo a prepararlo.
    // Sin programar, la tienda tiene que estar abierta ahora.
    if (scheduledFor !== undefined && typeof scheduledFor !== "string") {
      return NextResponse.json({ error: "Hora programada no válida" }, { status: 400 });
    }
    // Pantalla de pago: lo que el restaurante permite (notas, programar, propina).
    const checkout = readCheckout(tenant.settings);
    if (scheduledFor && !checkout.scheduling) {
      return NextResponse.json({ error: "Este restaurante no acepta pedidos programados" }, { status: 400 });
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
    // El premio solo se canjea desde un dispositivo que ya pidió con ese
    // teléfono (cookie firmada): saber el número de otro no basta para gastarlo.
    let loyaltyDiscountCents = 0;
    if (perks.loyalty && state.loyalty?.rewardAvailable && customerProven(req, tenant.id, customerPhone)) {
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
    // Colaborador: un código que no existe no impide el pedido, simplemente no cuenta.
    const collab = body.collaboratorCode ? await collaboratorByCode(tenant.id, body.collaboratorCode) : null;
    // Promoción, cupón y descuento del colaborador no se acumulan: gana el que más ahorra.
    // Si no gana el cupón, no se gasta.
    const collabOffer = collab ? collaboratorDiscountCents(afterLoyalty, collab.discountPct) : 0;
    const winner = bestDiscount(promo?.discountCents ?? 0, couponDiscountCents, collabOffer);
    const usePromo = winner === "promo" && !!promo;
    if (winner !== "coupon") {
      coupon = null;
      couponDiscountCents = 0;
    }
    const promotionDiscountCents = usePromo ? promo.discountCents : 0;
    const collabDiscountCents = winner === "collab" ? collabOffer : 0;
    const discountCents = Math.min(loyaltyDiscountCents + promotionDiscountCents + couponDiscountCents + collabDiscountCents, subtotalCents + feesCents);
    // Propina: un porcentaje de los que ofrece el restaurante, sobre la comida.
    const tipPct = Number(body.tipPercent ?? 0);
    if (tipPct && (!checkout.tips.enabled || !checkout.tips.percents.includes(tipPct))) {
      return NextResponse.json({ error: "Propina no válida" }, { status: 400 });
    }
    const tip = tipCents(subtotalCents - discountCents, tipPct);
    // Tarjeta regalo: cubre lo que pueda del total (el saldo se descuenta al crear el pedido).
    let giftCard: { id: string; cents: number } | null = null;
    if (typeof body.giftCardCode === "string" && body.giftCardCode.trim()) {
      const found = await usableGiftCard(tenant.id, body.giftCardCode);
      if ("error" in found) return NextResponse.json({ error: found.error }, { status: 400 });
      giftCard = { id: found.card.id, cents: Math.min(found.card.balanceCents, subtotalCents + feesCents - discountCents + tip) };
    }
    const totalCents = subtotalCents + feesCents - discountCents + tip - (giftCard?.cents ?? 0);
    const settings = tenant.settings as Record<string, unknown>;
    const currency = (settings?.currency as string) ?? "EUR";

    let order: Awaited<ReturnType<typeof createOrderWithNumber>> | null = null;
    let lastError: unknown;

    for (let attempt = 0; attempt < ORDER_NUMBER_RETRIES; attempt++) {
      try {
        order = await createOrderWithNumber({
          tenantId: tenant.id,
          storeId,
          channel,
          customerName,
          customerPhone,
          customerAddress: customerAddress ?? null,
          customerPostalCode: postalCode || null,
          notes: checkout.notes ? (notes ?? null) : null,
          marketingConsent: checkout.marketingConsent && marketingConsent === true,
          currency,
          subtotalCents,
          feesCents,
          discountCents,
          totalCents,
          coupon,
          promotionId: usePromo ? promo.promotion.id : null,
          promotionDiscountCents,
          collaboratorDiscountCents: collabDiscountCents,
          loyaltyDiscountCents,
          estimatedReadyAt: scheduledAt ?? new Date(Date.now() + 60_000 * leadMinutes(ops, channel)),
          scheduledFor: scheduledAt,
          // Pagado entero con tarjeta regalo: no hace falta pasarela.
          payment: totalCents === 0 && giftCard ? { method: "IN_STORE", provider: null, paid: true } : payment,
          tipCents: tip,
          giftCard,
          collaborator: collab && { id: collab.id, commissionCents: commissionCents(subtotalCents - discountCents, collab.commissionPct) },
          retention: tenant.addons.includes("RETENTION"),
          lines: linesCreate,
          // Inventario (módulo Costes): solo si el restaurante lo tiene contratado
          consumption: tenant.addons.includes("COSTS") ? consumption : [],
            costs: tenant.addons.includes("COSTS"),
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

    // Pago online: se abre la pasarela del restaurante. Si falla, el pedido se deshace.
    if (online && order.status === "AWAITING_PAYMENT") {
      try {
        const start = await startPayment(order.id, paymentMethod as OnlineMethod, url.origin, body.lang === "en" ? "en" : "es");
        return withCustomerProof(NextResponse.json({ orderId: order.id, orderNumber: order.orderNumber, totalCents: order.totalCents, payment: start }), tenant.id, customerPhone);
      } catch (err) {
        const msg = err instanceof GatewayError ? err.message : "No se ha podido abrir el pago";
        return NextResponse.json({ error: msg }, { status: 502 });
      }
    }

    // Aviso por email al restaurante (si lo tiene activo), después de responder.
    after(() => Promise.all([notifyNewOrder(order.id), issueInvoiceSafe(order.id).then(() => printOnNewOrder(order.id))]));
    return withCustomerProof(
      NextResponse.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      estimatedMinutes:
        channel === "DELIVERY"
          ? ops.estimatedDeliveryMinutes + ops.prepExtraMinutes
          : ops.estimatedPickupMinutes + ops.prepExtraMinutes,
      }),
      tenant.id,
      customerPhone
    );
  } catch (err) {
    console.error("[POST /api/orders]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
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

    // Pagos online abandonados: se cancelan y se deshacen.
    await expireStalePayments(tenant.id);

    // Repartidores externos en curso: se ponen al día antes de leer los pedidos
    // (pueden pasarlos a «En reparto» o «Entregado»).
    const live = await prisma.courierDelivery.findMany({
      where: { tenantId: tenant.id, status: { in: ACTIVE_STATUSES } },
      include: { order: { select: { status: true, updatedAt: true } } },
    });
    await Promise.all(live.map((d) => syncCourier(d, d.order)));

    // Sucursales: el empleado limitado a un local ve solo ese; el gerente puede
    // filtrar con ?store= (sin él, todos los locales).
    const stores = await listStores(tenant.id);
    const wanted = session.storeId ?? url.searchParams.get("store");
    const storeFilter = stores.find((st) => st.id === wanted)?.id ?? null;
    const byStore = storeFilter ? { storeId: storeFilter } : {};

    const orders = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        ...byStore,
        status: { in: ["CREATED", "ACCEPTED", "PREPARING", "READY", "DELIVERING"] },
      },
      include: { items: true, coupon: { select: { code: true } }, promotion: { select: { name: true } }, courier: true },
      orderBy: { createdAt: "asc" },
    });

    // Historial reciente (entregados/cancelados) para la sección plegada del panel.
    const since = new Date(Date.now() - HISTORY_WINDOW_MS);
    const history = await prisma.order.findMany({
      where: {
        tenantId: tenant.id,
        ...byStore,
        status: { in: ["DELIVERED", "CANCELLED"] },
        updatedAt: { gte: since },
      },
      include: { items: true, coupon: { select: { code: true } }, promotion: { select: { name: true } }, courier: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Tiempos estimados (con el tiempo extra) y estado del local para la cabecera.
    const ops = await getStoreOps(tenant.id, tenant.settings, new Date(), storeFilter);

    const account = await prisma.courierAccount.findUnique({ where: { tenantId: tenant.id }, select: { provider: true } });
    const withCourier = <T extends { courier: Parameters<typeof toPublicCourier>[0] }>(o: T) => ({ ...o, courier: toPublicCourier(o.courier) });
    return NextResponse.json({
      orders: orders.map(withCourier),
      history: history.map(withCourier),
      courierEnabled: !!account && account.provider !== "NONE",
      printingEnabled: readPrinting(tenant.settings).printers.length > 0,
      // Sucursales: lista para el filtro (solo si hay más de un local) y el filtro aplicado.
      stores: stores.length > 1 && !session.storeId ? stores.map((st) => ({ id: st.id, name: st.name })) : [],
      storeFilter,
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
