// Promociones y tarjeta de fidelidad leídas de la base de datos (motor de
// retención). El cálculo vive en promotions.ts (puro); aquí solo se carga.
import { prisma } from "@/app/lib/prisma";
import { normalizePhone } from "@/app/lib/retention";
import { tenantTimeZone, wallClockIn } from "@/app/lib/time";
import { loyaltyProgress, parseSlots, promotionLiveAt, type LoyaltyRule, type PromotionRule } from "@/app/lib/promotions";

type Db = Pick<typeof prisma, "order" | "customer">;

export type Perks = {
  promotions: PromotionRule[]; // solo las que están en vigor ahora mismo
  loyalty: (LoyaltyRule & { startsAt: Date }) | null;
};

export async function loadPerks(tenantId: string, settings: unknown, addons: string[], now = new Date()): Promise<Perks> {
  if (!addons.includes("RETENTION")) return { promotions: [], loyalty: null };
  const [promos, program] = await Promise.all([
    prisma.promotion.findMany({ where: { tenantId, active: true }, orderBy: { createdAt: "asc" } }),
    prisma.loyaltyProgram.findUnique({ where: { tenantId } }),
  ]);
  const clock = wallClockIn(tenantTimeZone(settings), now);
  const promotions = promos
    .map((p): PromotionRule => ({
      id: p.id, name: p.name, kind: p.kind, value: p.value, minOrderCents: p.minOrderCents, weekdays: p.weekdays,
      startTime: p.startTime, endTime: p.endTime, channel: p.channel, firstOrderOnly: p.firstOrderOnly,
      startsAt: p.startsAt, endsAt: p.endsAt, active: p.active,
    }))
    .filter((p) => promotionLiveAt(p, now, clock));
  const slots = program ? parseSlots(program.rewardSlots) : [];
  const loyalty =
    program && program.active && slots.length
      ? { active: true, ordersRequired: program.ordersRequired, rewardName: program.rewardName, rewardSlots: slots, maxRewardCents: program.maxRewardCents, startsAt: program.startsAt }
      : null;
  return { promotions, loyalty };
}

// Lo que ve el cliente en la carta y el checkout (sin datos internos).
export function publicPerks(perks: Perks) {
  return {
    promotions: perks.promotions,
    loyalty: perks.loyalty && {
      ordersRequired: perks.loyalty.ordersRequired,
      rewardName: perks.loyalty.rewardName,
      rewardSlots: perks.loyalty.rewardSlots,
      maxRewardCents: perks.loyalty.maxRewardCents,
    },
  };
}
export type PublicPerks = ReturnType<typeof publicPerks>;

// Historial del cliente para la tarjeta y las promociones de primer pedido.
export async function customerPerkState(db: Db, tenantId: string, phoneRaw: string, loyalty: Perks["loyalty"]) {
  const customer = await db.customer.findUnique({
    where: { tenantId_phone: { tenantId, phone: normalizePhone(phoneRaw) } },
    select: { id: true },
  });
  const validOrders = customer ? await db.order.count({ where: { customerId: customer.id, status: { not: "CANCELLED" } } }) : 0;
  let progress = null;
  if (loyalty) {
    const since = { customerId: customer?.id ?? "-", status: { not: "CANCELLED" as const }, createdAt: { gte: loyalty.startsAt } };
    const [paid, rewards] = customer
      ? await Promise.all([db.order.count({ where: { ...since, loyaltyReward: false } }), db.order.count({ where: { ...since, loyaltyReward: true } })])
      : [0, 0];
    progress = loyaltyProgress(loyalty, paid, rewards);
  }
  return { firstOrder: validOrders === 0, loyalty: progress };
}
