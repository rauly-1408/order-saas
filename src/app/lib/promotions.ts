// Promociones automáticas (sin código) y tarjeta de fidelidad. Funciones puras:
// las usan el servidor al crear el pedido (que es quien manda), la carta y el
// checkout para enseñar el descuento. Ver docs/PROMOCIONES-Y-FIDELIZACION.md
import { toMinutes } from "@/app/lib/storeStatus";

export type PromotionKind = "ORDER_PERCENT" | "ORDER_FIXED" | "FREE_DELIVERY";
export type Channel = "DELIVERY" | "TAKEAWAY";

export type PromotionRule = {
  id: string;
  name: string;
  kind: PromotionKind;
  value: number;
  minOrderCents: number;
  weekdays: number[]; // ISO 1-7; vacío = todos los días
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  channel: Channel | null;
  firstOrderOnly: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  active: boolean;
};

export const WEEKDAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const WEEKDAY_NAME = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];

const eur = (cents: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

// ¿La promoción está en vigor en este momento? (fechas, día y franja horaria, en
// la hora del restaurante). El canal, el mínimo y el primer pedido van aparte.
export function promotionLiveAt(p: PromotionRule, now: Date, clock: { isoWeekday: number; minutes: number }): boolean {
  if (!p.active) return false;
  if (p.startsAt && new Date(p.startsAt) > now) return false;
  if (p.endsAt && new Date(p.endsAt) <= now) return false;
  if (p.weekdays.length && !p.weekdays.includes(clock.isoWeekday)) return false;
  if (p.startTime && p.endTime) {
    const from = toMinutes(p.startTime);
    const to = toMinutes(p.endTime);
    const inRange = to > from ? clock.minutes >= from && clock.minutes < to : clock.minutes >= from || clock.minutes < to;
    if (!inRange) return false;
  }
  return true;
}

export type PromoContext = { subtotalCents: number; feesCents: number; channel: Channel; firstOrder: boolean | null };

// Descuento de una promoción ya en vigor (0 si no se cumplen sus condiciones).
// firstOrder = null cuando aún no sabemos quién pide (checkout sin teléfono).
export function promotionDiscount(p: PromotionRule, ctx: PromoContext): number {
  if (p.channel && p.channel !== ctx.channel) return 0;
  if (ctx.subtotalCents < p.minOrderCents) return 0;
  if (p.firstOrderOnly && ctx.firstOrder !== true) return 0;
  if (p.kind === "FREE_DELIVERY") return ctx.channel === "DELIVERY" ? ctx.feesCents : 0;
  const raw = p.kind === "ORDER_PERCENT" ? Math.round((ctx.subtotalCents * Math.min(Math.max(p.value, 0), 100)) / 100) : Math.max(p.value, 0);
  return Math.min(raw, ctx.subtotalCents);
}

// Las promociones no se acumulan: se aplica la que más ahorra.
export function bestPromotion<P extends PromotionRule>(promos: P[], ctx: PromoContext): { promotion: P; discountCents: number } | null {
  let best: { promotion: P; discountCents: number } | null = null;
  for (const p of promos) {
    const d = promotionDiscount(p, ctx);
    if (d > 0 && (!best || d > best.discountCents)) best = { promotion: p, discountCents: d };
  }
  return best;
}

// Texto para la carta y el panel: "20 % los martes de 20:00 a 23:00 · desde 15 €".
export function promotionLabel(p: Pick<PromotionRule, "kind" | "value">): string {
  if (p.kind === "FREE_DELIVERY") return "Envío gratis";
  return p.kind === "ORDER_PERCENT" ? `${p.value} % de descuento` : `${eur(p.value)} de descuento`;
}

export function promotionConditions(p: PromotionRule): string {
  const parts: string[] = [];
  if (p.weekdays.length && p.weekdays.length < 7) {
    const days = [...p.weekdays].sort().map((d) => WEEKDAY_NAME[d - 1]);
    parts.push(`los ${days.length > 1 ? `${days.slice(0, -1).join(", ")} y ${days[days.length - 1]}` : days[0]}`);
  }
  if (p.startTime && p.endTime) parts.push(`de ${p.startTime} a ${p.endTime}`);
  if (p.channel) parts.push(p.channel === "DELIVERY" ? "a domicilio" : "para recoger");
  if (p.minOrderCents > 0) parts.push(`en pedidos desde ${eur(p.minOrderCents)}`);
  if (p.firstOrderOnly) parts.push("en tu primer pedido");
  return parts.join(" · ");
}

// ── Tarjeta de fidelidad ────────────────────────────────────────────────

export type RewardSlot = { label: string; categoryIds: string[] };
export type LoyaltyRule = { active: boolean; ordersRequired: number; rewardName: string; rewardSlots: RewardSlot[]; maxRewardCents: number | null };

export function parseSlots(raw: unknown): RewardSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      const r = (s ?? {}) as Record<string, unknown>;
      return {
        label: typeof r.label === "string" ? r.label.trim() : "",
        categoryIds: Array.isArray(r.categoryIds) ? r.categoryIds.filter((c): c is string => typeof c === "string") : [],
      };
    })
    .filter((s) => s.label && s.categoryIds.length);
}

// Sellos acumulados desde el último premio. `paidOrders` = pedidos válidos sin
// premio desde que empezó la tarjeta; `rewards` = pedidos válidos con premio.
// El premio llega en el pedido nº N: hacen falta N−1 sellos.
export function loyaltyProgress(rule: Pick<LoyaltyRule, "ordersRequired">, paidOrders: number, rewards: number) {
  const needed = Math.max(rule.ordersRequired - 1, 1);
  const stamps = Math.max(paidOrders - rewards * needed, 0);
  return { stamps: Math.min(stamps, needed), needed, rewardAvailable: stamps >= needed };
}

export type CartLine = { key: string; categoryId: string | null; unitBaseCents: number; quantity: number };

// Qué productos del carrito salen gratis: en cada hueco, el más caro de sus
// categorías (solo el precio base; los extras se cobran), con el tope si lo hay.
export function rewardDiscount(rule: Pick<LoyaltyRule, "rewardSlots" | "maxRewardCents">, lines: CartLine[]): { discountCents: number; matched: string[]; missing: string[] } {
  const used = new Map<string, number>(); // unidades ya regaladas por línea
  let total = 0;
  const matched: string[] = [];
  const missing: string[] = [];
  for (const slot of rule.rewardSlots) {
    const pick = lines
      .filter((l) => l.categoryId && slot.categoryIds.includes(l.categoryId) && (used.get(l.key) ?? 0) < l.quantity)
      .sort((a, b) => b.unitBaseCents - a.unitBaseCents)[0];
    if (!pick) {
      missing.push(slot.label);
      continue;
    }
    used.set(pick.key, (used.get(pick.key) ?? 0) + 1);
    total += pick.unitBaseCents;
    matched.push(slot.label);
  }
  const capped = rule.maxRewardCents != null ? Math.min(total, rule.maxRewardCents) : total;
  return { discountCents: capped, matched, missing };
}

// "Bocadillo y Bebida" a partir de los huecos.
export function joinLabels(labels: string[]): string {
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}` : labels[0] ?? "";
}

// Desglose del descuento de un pedido para el panel y la confirmación.
export function discountLines(o: {
  discountCents: number;
  promotionDiscountCents?: number;
  loyaltyDiscountCents?: number;
  coupon?: { code: string } | null;
  promotion?: { name: string } | null;
}): { label: string; cents: number }[] {
  const loyalty = o.loyaltyDiscountCents ?? 0;
  const promo = o.promotionDiscountCents ?? 0;
  const coupon = o.discountCents - loyalty - promo;
  const lines: { label: string; cents: number }[] = [];
  if (loyalty > 0) lines.push({ label: "🎁 Premio de fidelidad", cents: loyalty });
  if (promo > 0) lines.push({ label: `🏷️ ${o.promotion?.name ?? "Promoción"}`, cents: promo });
  if (coupon > 0) lines.push({ label: `Cupón ${o.coupon?.code ?? ""}`.trim(), cents: coupon });
  return lines;
}
