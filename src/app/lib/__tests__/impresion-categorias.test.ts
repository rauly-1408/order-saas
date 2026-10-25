import { describe, expect, it } from "vitest";
import { coverage, linesForPrinter, parsePrinter, FREE_CATEGORY, type LineCategories, type Printer } from "../printing";

const printer = (categories: string[] | null): Printer => ({ ...(parsePrinter({ host: "192.168.1.31", roles: ["kitchen"] }) as Printer), categories });
const cats: LineCategories = {
  byProduct: new Map([
    ["genil", "molletes"],
    ["coca", "bebidas"],
    ["menu", "menus"],
  ]),
  byName: new Map([
    ["Genil", "molletes"],
    ["Coca-Cola", "bebidas"],
    ["Tarta", "postres"],
    ["Pionono casero (1 ud.)", "postres"],
  ]),
};
const lines = [
  { quantity: 1, productName: "Genil", productId: "genil", modifiers: [], note: "sin cebolla" },
  { quantity: 2, productName: "Coca-Cola", productId: "coca", modifiers: [], note: null },
  { quantity: 8, productName: "Chupito", productId: FREE_CATEGORY, modifiers: [], note: "Invita la casa" },
  {
    quantity: 1,
    productName: "Menú mollete",
    productId: "menu",
    modifiers: [
      { groupCode: "COMBO", group: "Mollete", option: "Genil (Pan tradicional)" },
      { groupCode: "COMBO", group: "Bebida", option: "Coca-Cola" },
      { groupCode: "COMBO", group: "Postre", option: "Tarta" },
    ],
    note: null,
  },
];

describe("Impresión · comandas por categoría", () => {
  it("sin categorías, la impresora lo recibe todo", () => {
    expect(linesForPrinter(lines, printer(null), cats)).toHaveLength(4);
  });
  it("la barra recibe las bebidas y, del menú, solo la bebida", () => {
    const bar = linesForPrinter(lines, printer(["bebidas", FREE_CATEGORY]), cats);
    expect(bar.map((l) => l.productName)).toEqual(["Coca-Cola", "Chupito", "Menú mollete"]);
    expect((bar[2].modifiers as { option: string }[]).map((m) => m.option)).toEqual(["Coca-Cola"]);
  });
  it("cocina recibe la comida y, del menú, el mollete y el postre", () => {
    const kitchen = linesForPrinter(lines, printer(["molletes", "postres"]), cats);
    expect(kitchen.map((l) => l.productName)).toEqual(["Genil", "Menú mollete"]);
    expect((kitchen[1].modifiers as { option: string }[]).map((m) => m.option)).toEqual(["Genil (Pan tradicional)", "Tarta"]);
  });
  it("cocina con todo menos bebidas: del menú no le llega la bebida", () => {
    const kitchen = linesForPrinter(lines, printer(["menus", "molletes", "postres"]), cats);
    expect((kitchen[1].modifiers as { option: string }[]).map((m) => m.option)).toEqual(["Genil (Pan tradicional)", "Tarta"]);
  });
  it("reconoce productos con paréntesis en el nombre", () => {
    const l = [{ quantity: 1, productName: "Menú", productId: "menu", modifiers: [{ groupCode: "COMBO", option: "Pionono casero (1 ud.)" }, { groupCode: "COMBO", option: "Genil (Pan tradicional)" }], note: null }];
    expect((linesForPrinter(l, printer(["postres"]), cats)[0].modifiers as { option: string }[]).map((m) => m.option)).toEqual(["Pionono casero (1 ud.)"]);
  });
  it("si solo tiene la categoría del menú, el menú va entero", () => {
    expect(linesForPrinter(lines, printer(["menus"]), cats)[0].modifiers).toHaveLength(3);
  });
  it("los productos libres solo van a la impresora que los tiene marcados", () => {
    expect(linesForPrinter(lines, printer(["molletes"]), cats).some((l) => l.productId === FREE_CATEGORY)).toBe(false);
  });
  it("ninguna categoría marcada equivale a todo", () => {
    expect(parsePrinter({ host: "192.168.1.31", roles: ["kitchen"], categories: [] })?.categories).toBeNull();
  });
  it("lo que no tiene impresora sale en todas (categoría nueva o sin marcar)", () => {
    const bar = printer(["bebidas"]);
    const kitchen = printer(["molletes"]);
    const c = { ...cats, covered: coverage([bar, kitchen]) };
    // Chupito (libre) y Menú (categoría «menus») no los tiene nadie: van a las dos.
    const names = (p: Printer) => linesForPrinter(lines, p, c).map((l) => l.productName);
    expect(names(bar)).toContain("Chupito");
    expect(names(kitchen)).toContain("Chupito");
    // Del menú, la tarta (postres, sin impresora) va a las dos; la bebida solo a la barra.
    const menuBar = linesForPrinter(lines, bar, c).find((l) => l.productName === "Menú mollete")!;
    expect((menuBar.modifiers as { option: string }[]).map((m) => m.option)).toEqual(["Coca-Cola", "Tarta"]);
    const menuKitchen = linesForPrinter(lines, kitchen, c).find((l) => l.productName === "Menú mollete")!;
    expect((menuKitchen.modifiers as { option: string }[]).map((m) => m.option)).toEqual(["Genil (Pan tradicional)", "Tarta"]);
  });
  it("si alguna impresora lo imprime todo, no hay nada sin impresora", () => {
    expect(coverage([printer(null), printer(["bebidas"])])).toBeNull();
  });
});
