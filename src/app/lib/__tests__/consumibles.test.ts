import { describe, expect, it } from "vitest";
import { consumableQty, orderKindOf } from "../consumables";

// Consumibles: lo que se gasta solo con cada pedido según su tipo.
const molletes = new Map([["carne", 2], ["veganos", 1]]); // 3 molletes en el pedido
const caja = { perOrderQty: null, perOrderChannels: ["DELIVERY", "TAKEAWAY"], perItemQty: 1, perItemCategoryIds: ["carne", "veganos", "mar"] };
const bolsa = { perOrderQty: 1, perOrderChannels: ["DELIVERY", "TAKEAWAY"], perItemQty: null, perItemCategoryIds: [] };
const servilletas = { perOrderQty: 2, perOrderChannels: [], perItemQty: null, perItemCategoryIds: [] };

describe("Consumibles por pedido", () => {
  it("una caja por cada mollete para llevar", () => {
    expect(consumableQty(caja, "TAKEAWAY", molletes)).toBe(3);
    expect(consumableQty(caja, "DELIVERY", molletes)).toBe(3);
  });
  it("comiendo aquí no se gasta packaging", () => {
    expect(consumableQty(caja, "HERE", molletes)).toBe(0);
    expect(consumableQty(bolsa, "HERE", molletes)).toBe(0);
  });
  it("una bolsa por pedido, lleve lo que lleve", () => {
    expect(consumableQty(bolsa, "DELIVERY", molletes)).toBe(1);
  });
  it("sin tipos marcados vale para todos los pedidos", () => {
    expect(consumableQty(servilletas, "HERE", new Map())).toBe(2);
  });
  it("tipo de pedido", () => {
    expect(orderKindOf("DELIVERY", false)).toBe("DELIVERY");
    expect(orderKindOf("TAKEAWAY", true)).toBe("HERE");
    expect(orderKindOf("TAKEAWAY", false)).toBe("TAKEAWAY");
  });
});
