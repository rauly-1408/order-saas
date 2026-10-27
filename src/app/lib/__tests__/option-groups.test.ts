import { describe, expect, it } from "vitest";
import { groupCode, parseGroup } from "../optionGroups";

describe("Carta → Opciones", () => {
  it("«Solo una» y obligatorio: hay que elegir exactamente una", () => {
    const g = parseGroup({ name: " Elige tu pan ", isRequired: true, options: [{ name: "Tradicional" }, { name: "Queso", priceDeltaCents: 50 }] });
    expect(g).toMatchObject({ name: "Elige tu pan", isRequired: true, minSelect: 1, maxSelect: 1 });
    expect(typeof g !== "string" && g.options[1]).toEqual({ name: "Queso", priceDeltaCents: 50, isAvailable: true });
  });

  it("«Varias»: el máximo queda entre 2 y el número de opciones", () => {
    const opts = [{ name: "A" }, { name: "B" }, { name: "C" }];
    expect(parseGroup({ name: "Extras", multiple: true, maxSelect: 10, options: opts })).toMatchObject({ isRequired: false, minSelect: 0, maxSelect: 3 });
    expect(parseGroup({ name: "Extras", multiple: true, maxSelect: 1, options: opts })).toMatchObject({ maxSelect: 2 });
  });

  it("rechaza grupos sin nombre, sin opciones, repetidas o con precios raros", () => {
    expect(parseGroup({ options: [{ name: "A" }] })).toMatch(/nombre/);
    expect(parseGroup({ name: "X", options: [] })).toMatch(/al menos una opción/);
    expect(parseGroup({ name: "X", options: [{ name: "A" }, { name: "a" }] })).toMatch(/mismo nombre/);
    expect(parseGroup({ name: "X", options: [{ name: "A", priceDeltaCents: 1.5 }] })).toMatch(/Precio/);
    expect(parseGroup({ name: "X", multiple: true, options: [{ name: "A" }] })).toMatch(/dos opciones/);
  });

  it("genera un código único y legible", () => {
    expect(groupCode("Elige tu pan", new Set())).toBe("elige-tu-pan");
    expect(groupCode("Elige tu pan", new Set(["elige-tu-pan"]))).toBe("elige-tu-pan-2");
    expect(groupCode("¿¡!?", new Set())).toBe("grupo");
  });
});
