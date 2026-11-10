import { describe, expect, it } from "vitest";
import { recommendOffer } from "../customerOffer";

const base = { name: "raúl garcía", segment: "REGULAR" as const, orders: 3, avgTicketCents: 1950, daysSinceLast: 5, favourite: "San Antón", usualDay: "los viernes", usualHour: 21 };

describe("recommendOffer", () => {
  it("al que lleva más de un mes sin pedir: 15 % para que vuelva", () => {
    const o = recommendOffer({ ...base, daysSinceLast: 45 });
    expect(o.coupon).toMatchObject({ type: "PERCENT", value: 15 });
    expect(o.message).toContain("Hola Raúl");
    expect(o.message).toContain("San Antón");
  });
  it("al nuevo: 10 % en el segundo pedido", () => {
    expect(recommendOffer({ ...base, orders: 1, segment: "NEW" }).coupon).toMatchObject({ type: "PERCENT", value: 10 });
  });
  it("al VIP: 5 € de regalo", () => {
    expect(recommendOffer({ ...base, segment: "VIP", orders: 12 }).coupon).toMatchObject({ type: "FIXED", value: 500 });
  });
  it("al habitual: 3 € a partir de un poco más de su ticket medio, redondeado a 5 €", () => {
    const o = recommendOffer(base);
    expect(o.coupon).toMatchObject({ type: "FIXED", value: 300, minOrderCents: 2500 });
    expect(o.when).toContain("los viernes");
    expect(o.when).toContain("21:00");
  });
});
