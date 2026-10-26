import { describe, expect, it } from "vitest";
import { pickBestSellers } from "../bestSellers";

// «Lo más pedido»: el más vendido de cada categoría, con un mínimo de unidades.
describe("Lo más pedido", () => {
  const cats = [{ products: [{ id: "taifa" }, { id: "isidro" }] }, { products: [{ id: "coca" }, { id: "agua" }] }, { products: [{ id: "tarta" }] }];
  it("uno por categoría, el que más unidades vende", () => {
    expect([...pickBestSellers(cats, { taifa: 12, isidro: 30, coca: 40, agua: 9, tarta: 2 })]).toEqual(["isidro", "coca"]);
  });
  it("sin el mínimo de ventas no hay etiqueta", () => {
    expect(pickBestSellers(cats, { taifa: 4, coca: 1 }).size).toBe(0);
  });
});
