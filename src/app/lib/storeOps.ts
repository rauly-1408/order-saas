// Operativa del local leída de la base de datos: horario, cierres, pausa, tiempo
// extra y zonas de reparto, con el estado calculado en la hora del restaurante.
import { prisma } from "@/app/lib/prisma";
import { tenantTimeZone, wallClockIn } from "@/app/lib/time";
import { parseHours, storeStatus, type StoreStatus, type WeeklyHours } from "@/app/lib/storeStatus";
import { availableSlots } from "@/app/lib/schedule";

export type StoreOps = {
  storeId: string;
  timeZone: string;
  hours: WeeklyHours;
  status: StoreStatus;
  pausedUntil: Date | null;
  prepExtraMinutes: number;
  deliveryEnabled: boolean;
  takeawayEnabled: boolean;
  deliveryFeeCents: number;
  minimumOrderCents: number;
  estimatedDeliveryMinutes: number;
  estimatedPickupMinutes: number;
  closures: { id: string; startsAt: Date; endsAt: Date; reason: string | null }[];
  zones: { id: string; name: string; postalCodes: string[]; feeCents: number; minOrderCents: number; active: boolean; sortOrder: number }[];
};

// storeId: el local concreto (sucursales); sin él, el primero.
export async function getStoreOps(tenantId: string, settings: unknown, now = new Date(), storeId?: string | null): Promise<StoreOps | null> {
  const store = await prisma.store.findFirst({
    where: { tenantId, ...(storeId && { id: storeId }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      closures: { where: { endsAt: { gt: now } }, orderBy: { startsAt: "asc" } },
      deliveryZones: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
  });
  if (!store) return null;
  const tz = tenantTimeZone(settings);
  const hours = parseHours(store.openingHours);
  const status = storeStatus({ hours, closures: store.closures, pausedUntil: store.pausedUntil }, now, wallClockIn(tz, now), tz);
  return {
    storeId: store.id,
    timeZone: tz,
    hours,
    status,
    pausedUntil: store.pausedUntil,
    prepExtraMinutes: store.prepExtraMinutes,
    deliveryEnabled: store.deliveryEnabled,
    takeawayEnabled: store.takeawayEnabled,
    deliveryFeeCents: store.deliveryFeeCents,
    minimumOrderCents: store.minimumOrderCents,
    estimatedDeliveryMinutes: store.estimatedDeliveryMinutes,
    estimatedPickupMinutes: store.estimatedPickupMinutes,
    closures: store.closures.map((c) => ({ id: c.id, startsAt: c.startsAt, endsAt: c.endsAt, reason: c.reason })),
    zones: store.deliveryZones.map((z) => ({ id: z.id, name: z.name, postalCodes: z.postalCodes, feeCents: z.feeCents, minOrderCents: z.minOrderCents, active: z.active, sortOrder: z.sortOrder })),
  };
}

// Minutos mínimos hasta un pedido programado (lo que tarda en estar listo o llegar).
export function leadMinutes(ops: StoreOps, channel: "DELIVERY" | "TAKEAWAY"): number {
  return (channel === "DELIVERY" ? ops.estimatedDeliveryMinutes : ops.estimatedPickupMinutes) + ops.prepExtraMinutes;
}

// Lo que necesita la carta pública (sin ids internos de cierres).
export function publicStoreInfo(ops: StoreOps, now = new Date()) {
  const sched = { hours: ops.hours, closures: ops.closures, pausedUntil: ops.pausedUntil };
  return {
    status: ops.status,
    prepExtraMinutes: ops.prepExtraMinutes,
    // Horas para programar el pedido (hoy y los próximos días), por canal.
    slots: {
      DELIVERY: ops.deliveryEnabled ? availableSlots(sched, now, ops.timeZone, leadMinutes(ops, "DELIVERY")) : [],
      TAKEAWAY: ops.takeawayEnabled ? availableSlots(sched, now, ops.timeZone, leadMinutes(ops, "TAKEAWAY")) : [],
    },
    zones: ops.zones.filter((z) => z.active).map((z) => ({ id: z.id, name: z.name, postalCodes: z.postalCodes, feeCents: z.feeCents, minOrderCents: z.minOrderCents })),
  };
}
export type PublicStoreInfo = ReturnType<typeof publicStoreInfo>;
