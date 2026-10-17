// Repartidor externo: pedir, consultar y cancelar el viaje de un pedido a
// domicilio, y reflejar su avance en el pedido (recogido → «En reparto»,
// entregado → «Entregado»). Ver docs/REPARTO-EXTERNO.md
import type { CourierDelivery, Order } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { readBusiness } from "@/app/lib/business";
import { geocodeAddress } from "@/app/lib/address";
import { openSecrets } from "./secrets";
import { simulatedProvider } from "./simulated";
import { glovoProvider } from "./glovo";
import {
  ACTIVE_STATUSES,
  CourierError,
  PROVIDERS,
  type AccountContext,
  type CourierPatch,
  type CourierProvider,
  type CourierStatus,
  type ProviderId,
} from "./types";

const IMPL: Partial<Record<ProviderId, CourierProvider>> = { SIMULATED: simulatedProvider, GLOVO: glovoProvider };

export const asProvider = (v: unknown): ProviderId => (PROVIDERS.includes(v as ProviderId) ? (v as ProviderId) : "NONE");
export const isActive = (status: string) => ACTIVE_STATUSES.includes(status as CourierStatus);

export async function courierAccount(tenantId: string) {
  const row = await prisma.courierAccount.findUnique({ where: { tenantId } });
  if (!row) return null;
  const provider = asProvider(row.provider);
  const ctx: AccountContext = { tenantId, config: (row.config ?? {}) as Record<string, unknown>, secrets: openSecrets(row.secrets) };
  return { row, provider, ctx, impl: IMPL[provider] ?? null };
}

const orderLabel = (o: Pick<Order, "orderNumber" | "id">) => (o.orderNumber ? `#${o.orderNumber}` : `#${o.id.slice(-5).toUpperCase()}`);

async function saveFailure(order: Pick<Order, "id" | "tenantId">, provider: ProviderId, error: string): Promise<CourierDelivery> {
  const data = { provider, status: "FAILED", error: error.slice(0, 300), externalId: null, rawStatus: null, trackingUrl: null, courierName: null, courierPhone: null, pickupEta: null, dropoffEta: null, feeCents: null };
  return prisma.courierDelivery.upsert({ where: { orderId: order.id }, create: { ...data, tenantId: order.tenantId, orderId: order.id }, update: data });
}

// Pide repartidor para un pedido a domicilio. Nunca lanza: si algo falla, el
// viaje queda en FAILED con el motivo, y el panel deja reintentarlo.
export async function requestCourier(orderId: string): Promise<CourierDelivery | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { quantity: true, productName: true } }, courier: true, tenant: { select: { name: true, settings: true } }, store: { select: { name: true, phone: true } } },
  });
  if (!order || order.channel !== "DELIVERY" || order.status === "CANCELLED" || order.status === "DELIVERED") return null;
  if (order.courier && (isActive(order.courier.status) || order.courier.status === "DELIVERED")) return order.courier;

  const account = await courierAccount(order.tenantId);
  if (!account?.impl) return null;
  try {
    const business = readBusiness(order.tenant.settings);
    const pickup = business.street ? await geocodeAddress(business.street, business.city) : null;
    if (!pickup) throw new CourierError("No encuentro la dirección del local. Revísala en Personalización → Datos del negocio (calle y número).");
    const dropoff = order.customerAddress ? await geocodeAddress(order.customerAddress, business.city) : null;
    if (!dropoff) throw new CourierError("No encuentro la dirección del cliente en el mapa. Llámale para confirmarla o pide el repartidor a mano.");

    const notes = [dropoff.extra, order.notes].filter(Boolean).join(" · ") || null;
    const update = await account.impl.request(
      {
        orderId: order.id,
        orderLabel: orderLabel(order),
        pickup: { name: order.tenant.name, phone: business.phone ?? order.store.phone, location: pickup },
        dropoff: { name: order.customerName, phone: order.customerPhone, location: dropoff, notes },
        description: order.items.map((i) => `${i.quantity}× ${i.productName}`).join(", ") || "Pedido de comida",
        amountCents: order.totalCents,
        paid: order.paymentStatus === "PAID",
        deliverAt: order.scheduledFor,
      },
      account.ctx
    );
    const data = { provider: account.provider, error: null, ...update, status: update.status };
    return await prisma.courierDelivery.upsert({ where: { orderId: order.id }, create: { ...data, tenantId: order.tenantId, orderId: order.id }, update: data });
  } catch (err) {
    const msg = err instanceof CourierError ? err.message : "No se ha podido pedir el repartidor. Inténtalo de nuevo.";
    if (!(err instanceof CourierError)) console.error("[requestCourier]", err);
    return saveFailure(order, account.provider, msg);
  }
}

// Aplica un cambio del proveedor al viaje y, si toca, al pedido.
export async function applyCourierPatch(delivery: CourierDelivery, patch: CourierPatch): Promise<CourierDelivery> {
  const status = patch.status ?? (delivery.status as CourierStatus);
  const updated = await prisma.courierDelivery.update({
    where: { id: delivery.id },
    data: {
      status,
      ...(patch.rawStatus !== undefined && { rawStatus: patch.rawStatus }),
      ...(patch.feeCents != null && { feeCents: patch.feeCents }),
      ...(patch.trackingUrl && { trackingUrl: patch.trackingUrl }),
      ...(patch.courierName && { courierName: patch.courierName }),
      ...(patch.courierPhone && { courierPhone: patch.courierPhone }),
      ...(patch.pickupEta && { pickupEta: patch.pickupEta }),
      ...(patch.dropoffEta && { dropoffEta: patch.dropoffEta }),
    },
  });
  // El pedido solo avanza: recogido → En reparto; entregado → Entregado.
  const target = status === "DELIVERED" ? "DELIVERED" : status === "PICKED_UP" || status === "NEAR_CUSTOMER" ? "DELIVERING" : null;
  if (target) {
    const from = target === "DELIVERED" ? ["PREPARING", "ACCEPTED", "READY", "DELIVERING"] : ["PREPARING", "ACCEPTED", "READY"];
    await prisma.order.updateMany({ where: { id: delivery.orderId, status: { in: from as Order["status"][] } }, data: { status: target } });
  }
  return updated;
}

const GLOVO_POLL_MS = 60_000; // los avisos de Glovo mandan; consultar como mucho una vez por minuto

// Pone al día un viaje activo (el panel lo llama al refrescar los pedidos).
export async function syncCourier(delivery: CourierDelivery, order: Pick<Order, "status" | "updatedAt">): Promise<CourierDelivery> {
  if (!isActive(delivery.status) || !delivery.externalId) return delivery;
  if (delivery.provider === "GLOVO" && Date.now() - delivery.updatedAt.getTime() < GLOVO_POLL_MS) return delivery;
  const account = await courierAccount(delivery.tenantId);
  const impl = IMPL[asProvider(delivery.provider)];
  if (!account || !impl) return delivery;
  try {
    const patch = await impl.fetch({ externalId: delivery.externalId, createdAt: delivery.createdAt, orderStatus: order.status, orderUpdatedAt: order.updatedAt }, account.ctx);
    const changed = patch.status !== null && patch.status !== delivery.status;
    // Sin cambios: solo se toca la fecha para no volver a consultar enseguida.
    if (!changed && delivery.provider !== "GLOVO") return delivery;
    return await applyCourierPatch(delivery, patch);
  } catch (err) {
    console.error("[syncCourier]", err);
    return delivery;
  }
}

// Cancela el repartidor (al cancelar el pedido o desde la tarjeta).
export async function cancelCourier(orderId: string): Promise<CourierDelivery | null> {
  const delivery = await prisma.courierDelivery.findUnique({ where: { orderId } });
  if (!delivery || !isActive(delivery.status)) return delivery;
  const account = await courierAccount(delivery.tenantId);
  const impl = IMPL[asProvider(delivery.provider)];
  try {
    if (impl && account && delivery.externalId) await impl.cancel(delivery.externalId, account.ctx);
  } catch (err) {
    // Glovo no deja cancelar si el repartidor ya lo ha aceptado.
    const msg = err instanceof CourierError ? err.message : "No se ha podido cancelar";
    return prisma.courierDelivery.update({ where: { id: delivery.id }, data: { error: `${msg}. Cancélalo en la app del proveedor.` } });
  }
  return prisma.courierDelivery.update({ where: { id: delivery.id }, data: { status: "CANCELLED", error: null } });
}

export type PublicCourier = {
  provider: ProviderId;
  status: CourierStatus;
  feeCents: number | null;
  trackingUrl: string | null;
  courierName: string | null;
  pickupEta: string | null;
  dropoffEta: string | null;
  error: string | null;
};

export function toPublicCourier(d: CourierDelivery | null | undefined): PublicCourier | null {
  if (!d) return null;
  return {
    provider: asProvider(d.provider),
    status: d.status as CourierStatus,
    feeCents: d.feeCents,
    trackingUrl: d.trackingUrl,
    courierName: d.courierName,
    pickupEta: d.pickupEta?.toISOString() ?? null,
    dropoffEta: d.dropoffEta?.toISOString() ?? null,
    error: d.error,
  };
}

// Lo que ve el cliente: solo estado, llegada y enlace de seguimiento (sin
// teléfono ni nombre del repartidor, ni errores internos).
export type CustomerCourier = { status: CourierStatus; dropoffEta: string | null; trackingUrl: string | null };
export function customerCourier(d: CourierDelivery | null | undefined): CustomerCourier | null {
  if (!d || d.status === "FAILED" || d.status === "CANCELLED") return null;
  return { status: d.status as CourierStatus, dropoffEta: d.dropoffEta?.toISOString() ?? null, trackingUrl: d.trackingUrl };
}
