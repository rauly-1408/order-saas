import { describe, expect, it } from "vitest";
import { bestPromotion, loyaltyProgress, promotionDiscount, promotionLiveAt, rewardDiscount, type PromotionRule } from "@/app/lib/promotions";

const base: PromotionRule = {
  id: "p1",
  name: "Martes",
  kind: "ORDER_PERCENT",
  value: 10,
  minOrderCents: 0,
  weekdays: [],
  startTime: null,
  endTime: null,
  channel: null,
  firstOrderOnly: false,
  startsAt: null,
  endsAt: null,
  active: true,
};
const now = new Date("2026-10-21T18:00:00Z");

describe("promotionLiveAt", () => {
  it("respeta el día de la semana y la franja horaria", () => {
    const p = { ...base, weekdays: [2], startTime: "20:00", endTime: "23:00" };
    expect(promotionLiveAt(p, now, { isoWeekday: 2, minutes: 20 * 60 + 30 })).toBe(true);
    expect(promotionLiveAt(p, now, { isoWeekday: 3, minutes: 20 * 60 + 30 })).toBe(false);
    expect(promotionLiveAt(p, now, { isoWeekday: 2, minutes: 23 * 60 })).toBe(false);
  });

  it("entiende una franja que pasa de medianoche", () => {
    const p = { ...base, startTime: "22:00", endTime: "02:00" };
    expect(promotionLiveAt(p, now, { isoWeekday: 5, minutes: 23 * 60 })).toBe(true);
    expect(promotionLiveAt(p, now, { isoWeekday: 6, minutes: 60 })).toBe(true);
    expect(promotionLiveAt(p, now, { isoWeekday: 6, minutes: 3 * 60 })).toBe(false);
  });

  it("no está en vigor si está desactivada o fuera de fechas", () => {
    expect(promotionLiveAt({ ...base, active: false }, now, { isoWeekday: 1, minutes: 0 })).toBe(false);
    expect(promotionLiveAt({ ...base, endsAt: "2026-10-01T00:00:00Z" }, now, { isoWeekday: 1, minutes: 0 })).toBe(false);
  });
});

describe("promotionDiscount", () => {
  const ctx = { subtotalCents: 2000, feesCents: 250, channel: "DELIVERY" as const, firstOrder: null };
  it("porcentaje, fijo y envío gratis", () => {
    expect(promotionDiscount({ ...base, kind: "ORDER_PERCENT", value: 10 }, ctx)).toBe(200);
    expect(promotionDiscount({ ...base, kind: "ORDER_FIXED", value: 300 }, ctx)).toBe(300);
    expect(promotionDiscount({ ...base, kind: "FREE_DELIVERY" }, ctx)).toBe(250);
    expect(promotionDiscount({ ...base, kind: "FREE_DELIVERY" }, { ...ctx, channel: "TAKEAWAY" })).toBe(0);
  });
  it("nunca descuenta más que el subtotal ni por debajo del mínimo", () => {
    expect(promotionDiscount({ ...base, kind: "ORDER_FIXED", value: 5000 }, ctx)).toBe(2000);
    expect(promotionDiscount({ ...base, minOrderCents: 2500 }, ctx)).toBe(0);
  });
  it("el descuento de primer pedido solo cuando se sabe que lo es", () => {
    const p = { ...base, firstOrderOnly: true };
    expect(promotionDiscount(p, { ...ctx, firstOrder: null })).toBe(0);
    expect(promotionDiscount(p, { ...ctx, firstOrder: false })).toBe(0);
    expect(promotionDiscount(p, { ...ctx, firstOrder: true })).toBe(200);
  });
  it("bestPromotion elige la que más ahorra", () => {
    const best = bestPromotion([{ ...base, id: "a", value: 10 }, { ...base, id: "b", kind: "ORDER_FIXED", value: 350 }], ctx);
    expect(best?.promotion.id).toBe("b");
    expect(best?.discountCents).toBe(350);
  });
});

describe("tarjeta de sellos", () => {
  it("el premio llega en el pedido nº N", () => {
    const rule = { ordersRequired: 5 };
    expect(loyaltyProgress(rule, 0, 0)).toEqual({ stamps: 0, needed: 4, rewardAvailable: false });
    expect(loyaltyProgress(rule, 3, 0)).toEqual({ stamps: 3, needed: 4, rewardAvailable: false });
    expect(loyaltyProgress(rule, 4, 0)).toEqual({ stamps: 4, needed: 4, rewardAvailable: true });
    // Tras canjear: 5 pedidos pagados y 1 premio → vuelve a empezar con 1 sello.
    expect(loyaltyProgress(rule, 5, 1)).toEqual({ stamps: 1, needed: 4, rewardAvailable: false });
  });

  it("regala el más caro de cada hueco y avisa de lo que falta", () => {
    const rule = { rewardSlots: [{ label: "Mollete", categoryIds: ["c-mol"] }, { label: "Bebida", categoryIds: ["c-beb"] }], maxRewardCents: null };
    const lines = [
      { key: "a", categoryId: "c-mol", unitBaseCents: 995, quantity: 1 },
      { key: "b", categoryId: "c-mol", unitBaseCents: 1295, quantity: 1 },
    ];
    const r = rewardDiscount(rule, lines);
    expect(r.discountCents).toBe(1295);
    expect(r.matched).toEqual(["Mollete"]);
    expect(r.missing).toEqual(["Bebida"]);
  });

  it("respeta el tope del premio", () => {
    const rule = { rewardSlots: [{ label: "Mollete", categoryIds: ["c-mol"] }], maxRewardCents: 800 };
    expect(rewardDiscount(rule, [{ key: "a", categoryId: "c-mol", unitBaseCents: 1295, quantity: 1 }]).discountCents).toBe(800);
  });
});
