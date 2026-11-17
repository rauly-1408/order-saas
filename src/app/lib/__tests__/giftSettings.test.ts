import { describe, expect, it } from "vitest";
import { GIFT_MIN_DEFAULT, giftMinMessage, giftMinOrderCents } from "../giftSettings";

describe("compra mínima de las tarjetas regalo", () => {
  it("10 € por defecto, 0 = sin mínimo y valores raros al defecto", () => {
    expect(giftMinOrderCents({})).toBe(GIFT_MIN_DEFAULT);
    expect(GIFT_MIN_DEFAULT).toBe(1000);
    expect(giftMinOrderCents({ giftCards: { minOrderCents: 0 } })).toBe(0);
    expect(giftMinOrderCents({ giftCards: { minOrderCents: 1500 } })).toBe(1500);
    expect(giftMinOrderCents({ giftCards: { minOrderCents: -5 } })).toBe(GIFT_MIN_DEFAULT);
    expect(giftMinOrderCents({ giftCards: { minOrderCents: "x" } })).toBe(GIFT_MIN_DEFAULT);
  });
  it("mensaje en euros", () => expect(giftMinMessage(1000)).toContain("10,00 €"));
});
