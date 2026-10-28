import { describe, expect, it } from "vitest";
import { classifyMenu } from "../menuEngineering";

describe("ingeniería de menús", () => {
  it("clasifica en estrellas, caballos de tiro, enigmas y perros", () => {
    const r = classifyMenu([
      { id: "estrella", units: 100, profitCents: 600 },
      { id: "caballo", units: 120, profitCents: 200 },
      { id: "enigma", units: 10, profitCents: 700 },
      { id: "perro", units: 5, profitCents: 150 },
    ]);
    const q = Object.fromEntries(r.items.map((i) => [i.id, i.quadrant]));
    expect(q).toEqual({ estrella: "star", caballo: "plowhorse", enigma: "puzzle", perro: "dog" });
    expect(r.popularityLine).toBeCloseTo((0.7 * 235) / 4);
    expect(r.profitLine).toBeCloseTo((100 * 600 + 120 * 200 + 10 * 700 + 5 * 150) / 235);
  });

  it("sin ventas, nadie es popular y se compara con la media simple", () => {
    const r = classifyMenu([
      { id: "a", units: 0, profitCents: 500 },
      { id: "b", units: 0, profitCents: 100 },
    ]);
    expect(r.items.map((i) => i.quadrant)).toEqual(["puzzle", "dog"]);
    expect(r.profitLine).toBe(300);
  });

  it("una carta vacía no falla", () => {
    expect(classifyMenu([])).toEqual({ items: [], popularityLine: 0, profitLine: 0 });
  });
});
