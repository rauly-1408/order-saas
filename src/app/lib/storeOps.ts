// Operativa del local leída de la base de datos: horario, cierres, pausa, tiempo
// extra y zonas de reparto, con el estado calculado en la hora del restaurante.
import { prisma } from "@/app/lib/prisma";
import { tenantTimeZone, wallClockIn } from "@/app/lib/time";
import { parseHours, storeStatus, type StoreStatus, type WeeklyHours } from "@/app/lib/storeStatus";

export type StoreOps = {
  storeId: string;
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

export async function getStoreOps(tenantId: string, settings: unknown, now = new Date()): Promise<StoreOps | null> {
  const store = await prisma.store.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
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

// Lo que necesita la carta pública (sin ids internos de cierres).
export function publicStoreInfo(ops: StoreOps) {
  return {
    status: ops.status,
    prepExtraMinutes: ops.prepExtraMinutes,
    zones: ops.zones.filter((z) => z.active).map((z) => ({ id: z.id, name: z.name, postalCodes: z.postalCodes, feeCents: z.feeCents, minOrderCents: z.minOrderCents })),
  };
}
export type PublicStoreInfo = ReturnType<typeof publicStoreInfo>;
