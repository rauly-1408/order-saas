import { describe, expect, it } from "vitest";
import { equalShares, splitLineAmounts, tableNames } from "../tables";

describe("Mesas · cuenta por separado", () => {
  it("una parte de la línea lleva su importe proporcional, sin perder céntimos", () => {
    const line = { quantity: 3, totalCents: 1000, discountCents: 0 };
    const one = splitLineAmounts(line, 1);
    expect(one.movedTotal).toBe(333);
    expect(line.totalCents - one.movedTotal).toBe(667); // lo que queda en la mesa
    expect(splitLineAmounts(line, 3).movedTotal).toBe(1000);
  });
  it("reparte también el descuento de la línea", () => {
    expect(splitLineAmounts({ quantity: 2, totalCents: 800, discountCents: 200 }, 1)).toEqual({ movedTotal: 400, movedDiscount: 100 });
  });
  it("rechaza cantidades imposibles", () => {
    expect(() => splitLineAmounts({ quantity: 2, totalCents: 800, discountCents: 0 }, 3)).toThrow();
    expect(() => splitLineAmounts({ quantity: 2, totalCents: 800, discountCents: 0 }, 0)).toThrow();
  });
});

describe("Mesas · a partes iguales", () => {
  it("suma exactamente el total y reparte los céntimos sobrantes", () => {
    const s = equalShares(2500, 3);
    expect(s).toEqual([834, 833, 833]);
    expect(s.reduce((a, b) => a + b, 0)).toBe(2500);
  });
  it("una persona paga todo", () => expect(equalShares(1999, 1)).toEqual([1999]));
});

describe("Mesas · crear varias", () => {
  it("numera con y sin prefijo", () => {
    expect(tableNames("", 1, 3)).toEqual(["1", "2", "3"]);
    expect(tableNames("B", 1, 3)).toEqual(["B1", "B2", "B3"]);
  });
  it("no crea nada con un rango vacío y limita a 100 de golpe", () => {
    expect(tableNames("", 5, 2)).toEqual([]);
    expect(tableNames("", 1, 500)).toHaveLength(100);
  });
});
