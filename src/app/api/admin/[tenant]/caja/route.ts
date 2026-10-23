import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { resolveStoreId } from "@/app/lib/stores";
import { getStoreOps, leadMinutes } from "@/app/lib/storeOps";
import { normalizePostalCode, zoneForPostalCode } from "@/app/lib/storeStatus";
import { customerPerkState, loadPerks } from "@/app/lib/perks";
import { bestPromotion, rewardDiscount } from "@/app/lib/promotions";
import { couponDiscount, couponProblem, normalizeCode } from "@/app/lib/retention";
import { invalidLine, priceOrderItems, type OrderLineInput } from "@/app/lib/orderPricing";
import { CouponError, createOrderWithNumber } from "@/app/lib/createOrder";
import { notifyNewOrder } from "@/app/lib/notifyOrder";
import { printOnNewOrder } from "@/app/lib/printing";
import { issueInvoiceSafe } from "@/app/lib/verifactu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/caja → pedido tomado en el mostrador o por teléfono.
// Lo puede usar cualquier usuario del restaurante (también el rol «Pedidos»).
// A diferencia de la tienda: no exige teléfono, no comprueba el horario y el
// cobro en efectivo/datáfono/Bizum queda pagado al crearse. Ver docs/CAJA.md

type Body = {
  items?: OrderLineInput[];
  source?: "COUNTER" | "PHONE";
  dineIn?: boolean;
  channel?: "TAKEAWAY" | "DELIVERY";
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerPostalCode?: string;
  notes?: string;
  couponCode?: string;
  paymentMethod?: "CASH" | "CARD_TERMINAL" | "BIZUM" | "IN_STORE";
  cashTenderedCents?: number;
  storeId?: string;
};

const PHONE = /^(?:\+34|0034)?[6789]\d{8}$/;
const RETRIES = 5;

export async function POST(req: NextRequest) {
  try {
    const slug = new URL(req.url).pathname.split("/").at(-2) ?? "";
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });

    const b = ((await req.json().catch(() => null)) ?? {}) as Body;
    const items = Array.isArray(b.items) ? b.items : [];
    if (!items.length || items.some(invalidLine)) return NextResponse.json({ error: "Añade algo al pedido" }, { status: 400 });
    const source = b.source === "PHONE" ? "PHONE" : "COUNTER";
    const channel = b.channel === "DELIVERY" ? "DELIVERY" : "TAKEAWAY";
    const dineIn = channel === "TAKEAWAY" && b.dineIn === true;
    const paymentMethod = (["CASH", "CARD_TERMINAL", "BIZUM", "IN_STORE"] as const).find((m) => m === b.paymentMethod) ?? "CASH";
    const customerPhone = typeof b.customerPhone === "string" ? b.customerPhone.replace(/[\s-]/g, "") : "";
    if (customerPhone && !PHONE.test(customerPhone)) return NextResponse.json({ error: "Teléfono no válido" }, { status: 400 });
    const customerName = (typeof b.customerName === "string" && b.customerName.trim().slice(0, 80)) || (source === "PHONE" ? "Teléfono" : "Mostrador");
    const customerAddress = typeof b.customerAddress === "string" ? b.customerAddress.trim().slice(0, 200) : "";
    if (channel === "DELIVERY" && !customerAddress) return NextResponse.json({ error: "Escribe la dirección de entrega" }, { status: 400 });
    const cashTendered = paymentMethod === "CASH" && Number.isInteger(b.cashTenderedCents) && (b.cashTenderedCents as number) >= 0 ? (b.cashTenderedCents as number) : null;

    // Local: el de la sesión (rol «Pedidos» limitado) o el elegido / el primero.
    const storeId = await resolveStoreId(tenant.id, session.storeId ?? b.storeId, { activeOnly: true });
    if (!storeId) return NextResponse.json({ error: "No hay ningún local activo" }, { status: 400 });
    const ops = await getStoreOps(tenant.id, tenant.settings, new Date(), storeId);
    if (!ops) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });

    const priced = await priceOrderItems(tenant.id, items, { allowDiscount: true });
    if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 400 });
    const { linesCreate, cartLines, consumption, subtotalCents } = priced;

    // Envío a domicilio: tarifa del local o de la zona si hay código postal.
    const postalCode = b.customerPostalCode ? normalizePostalCode(b.customerPostalCode) : "";
    let feesCents = 0;
    if (channel === "DELIVERY") {
      feesCents = ops.deliveryFeeCents;
      const zone = postalCode.length === 5 ? zoneForPostalCode(ops.zones.filter((z) => z.active), postalCode) : null;
      if (zone) feesCents = zone.feeCents;
    }

    // Descuentos como en la tienda: premio de sellos (si hay teléfono: el
    // personal lo ha comprobado en persona), promoción automática o cupón.
    const perks = await loadPerks(tenant.id, tenant.settings, tenant.addons);
    const state = customerPhone ? await customerPerkState(prisma, tenant.id, customerPhone, perks.loyalty) : { firstOrder: null, loyalty: null };
    let loyaltyDiscountCents = 0;
    if (perks.loyalty && state.loyalty?.rewardAvailable) loyaltyDiscountCents = rewardDiscount(perks.loyalty, cartLines).discountCents;
    const afterLoyalty = subtotalCents - loyaltyDiscountCents;
    const promo = bestPromotion(perks.promotions, { subtotalCents: afterLoyalty, feesCents, channel, firstOrder: state.firstOrder });
    const code = typeof b.couponCode === "string" && b.couponCode.trim() ? normalizeCode(b.couponCode) : "";
    let coupon: { id: string; oncePerCustomer: boolean; maxRedemptions: number | null } | null = null;
    let couponDiscountCents = 0;
    if (code) {
      const found = tenant.addons.includes("RETENTION") ? await prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code } } }) : null;
      if (!found) return NextResponse.json({ error: "Ese cupón no existe" }, { status: 400 });
      const problem = couponProblem(found, subtotalCents);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      coupon = { id: found.id, oncePerCustomer: found.oncePerCustomer, maxRedemptions: found.maxRedemptions };
      couponDiscountCents = couponDiscount(found, afterLoyalty);
    }
    const usePromo = !!promo && promo.discountCents > couponDiscountCents;
    if (usePromo) {
      coupon = null;
      couponDiscountCents = 0;
    }
    const promotionDiscountCents = usePromo ? promo.discountCents : 0;
    const discountCents = Math.min(loyaltyDiscountCents + promotionDiscountCents + couponDiscountCents, subtotalCents + feesCents);
    const totalCents = subtotalCents + feesCents - discountCents;
    if (cashTendered != null && cashTendered < totalCents) return NextResponse.json({ error: "El efectivo entregado no llega al total" }, { status: 400 });

    let order: Awaited<ReturnType<typeof createOrderWithNumber>> | null = null;
    for (let attempt = 0; attempt < RETRIES; attempt++) {
      try {
        order = await createOrderWithNumber({
          tenantId: tenant.id,
          storeId,
          channel,
          customerName,
          customerPhone,
          customerAddress: customerAddress || null,
          customerPostalCode: postalCode || null,
          notes: typeof b.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 300) : null,
          marketingConsent: false,
          currency: ((tenant.settings as Record<string, unknown>)?.currency as string) ?? "EUR",
          subtotalCents,
          feesCents,
          discountCents,
          totalCents,
          coupon,
          promotionId: usePromo ? promo.promotion.id : null,
          promotionDiscountCents,
          loyaltyDiscountCents,
          estimatedReadyAt: new Date(Date.now() + 60_000 * leadMinutes(ops, channel)),
          scheduledFor: null,
          payment: { method: paymentMethod, provider: null, paid: paymentMethod !== "IN_STORE" },
          tipCents: 0,
          giftCard: null,
          retention: tenant.addons.includes("RETENTION"),
          lines: linesCreate,
          consumption: tenant.addons.includes("COSTS") ? consumption : [],
          source,
          dineIn,
          createdByUserId: session.userId,
          cashTenderedCents: cashTendered,
        });
        break;
      } catch (err) {
        if (err instanceof CouponError) return NextResponse.json({ error: err.message }, { status: 400 });
        const collision = err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2002" || err.code === "P2034");
        if (!collision || attempt === RETRIES - 1) throw err;
        await new Promise((r) => setTimeout(r, 10 + Math.random() * 30));
      }
    }
    if (!order) throw new Error("No se pudo crear el pedido");
    // VeriFactu: la factura simplificada se emite al cobrar (si está activo).
    const invoice = await issueInvoiceSafe(order.id);
    after(() => Promise.all([notifyNewOrder(order!.id), printOnNewOrder(order!.id)]));
    return NextResponse.json({
      invoiceNumber: invoice?.numSerie ?? null,
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      discountCents,
      changeCents: cashTendered != null ? cashTendered - totalCents : null,
    });
  } catch (err) {
    console.error("[POST /api/admin/caja]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
