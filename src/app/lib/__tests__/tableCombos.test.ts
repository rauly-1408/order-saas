import { describe, expect, it } from "vitest";
import { readCombos, tableOptions } from "../tableCombos";

const tables = [
  { id: "t1", name: "1", seats: 2, zone: "Interior" },
  { id: "t5", name: "5", seats: 2, zone: "Interior" },
  { id: "t6", name: "6", seats: 3, zone: "Interior" },
  { id: "t8", name: "8", seats: 6, zone: "Interior" },
];
const combos = readCombos([{ id: "a", tables: ["t5", "t6"], min: 3, max: 5, priority: 1 }]);

describe("tableOptions", () => {
  it("ofrece la mesa suelta más ajustada primero", () => {
    expect(tableOptions(tables, combos, 2, new Set())[0]).toMatchObject({ label: "Mesa 1", fits: true });
  });
  it("usa la combinación cuando no hay mesa suelta que encaje", () => {
    const opts = tableOptions(tables, combos, 5, new Set(["t8"]));
    expect(opts[0]).toMatchObject({ label: "Mesas 5 + 6", combo: true, tableIds: ["t5", "t6"] });
  });
  it("no ofrece combinaciones con alguna mesa ocupada", () => {
    expect(tableOptions(tables, combos, 5, new Set(["t8", "t6"])).every((o) => !o.combo)).toBe(true);
  });
  it("deja al final las mesas pequeñas, marcadas como que no caben", () => {
    const opts = tableOptions(tables, combos, 4, new Set());
    expect(opts.at(-1)).toMatchObject({ fits: false });
    expect(opts[0]).toMatchObject({ label: "Mesa 8", fits: true });
  });
});

describe("readCombos", () => {
  it("descarta combinaciones de una sola mesa o con mesas de otro local", () => {
    expect(readCombos([{ tables: ["t1"] }, { tables: ["t1", "zz"] }], new Set(["t1", "t5"]))).toEqual([]);
    expect(readCombos([{ tables: ["t1", "t5"], min: 6, max: 2 }])[0]).toMatchObject({ min: 6, max: 6 });
    expect(readCombos([{ tables: ["t1", "t5"] }, { tables: ["t5", "t1"] }])).toHaveLength(1);
  });
});
