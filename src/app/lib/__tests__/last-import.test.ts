import { describe, expect, it } from "vitest";
import { lastStoreUrl, matchProducts, nameKey, parseLastStore } from "../lastImport";

// Página mínima con el formato de __NUXT_DATA__ (objetos que apuntan por índice).
function page(products: { name: string; imageId: string; allergens: string[]; specs: string[] }[]): string {
  const arr: unknown[] = [{ data: 1 }, ["Reactive", 2], []];
  const list = arr[2] as number[];
  for (const p of products) {
    const idx = arr.length;
    arr.push({ itemType: idx + 1, name: idx + 2, imageId: idx + 3, price: idx + 4, allergens: idx + 5, specifications: idx + 5 + 1 + p.allergens.length });
    arr.push("product", p.name, p.imageId, 995);
    const aStart = arr.length;
    arr.push(p.allergens.map((_, i) => aStart + 1 + i));
    p.allergens.forEach((a) => arr.push(a));
    const sStart = arr.length;
    arr.push(p.specs.map((_, i) => sStart + 1 + i));
    p.specs.forEach((s) => arr.push(s));
    list.push(idx);
  }
  return `<html><script type="application/json" id="__NUXT_DATA__">${JSON.stringify(arr)}</script></html>`;
}

describe("importar de Last.app", () => {
  it("solo acepta tiendas *.last.shop por https", () => {
    expect(lastStoreUrl("https://estafetenmolleteria.last.shop/?r=2")?.hostname).toBe("estafetenmolleteria.last.shop");
    expect(lastStoreUrl("http://x.last.shop")).toBeNull();
    expect(lastStoreUrl("https://last.shop.evil.com")).toBeNull();
    expect(lastStoreUrl(42)).toBeNull();
  });

  it("lee productos, alérgenos y sellos", () => {
    const out = parseLastStore(page([{ name: "Genil -Estilo pollo", imageId: "abc123xyz", allergens: ["gluten", "sesame"], specs: ["vegan", "vegetarian"] }]));
    expect(out).toEqual([{ name: "Genil -Estilo pollo", description: "", priceCents: 995, imageId: "abc123xyz", allergens: ["Gluten", "Sésamo"], diet: ["VEGAN", "VEGETARIAN"] }]);
    expect(parseLastStore("<html>sin datos</html>")).toEqual([]);
  });

  it("compara nombres sin coletillas ni tildes y guarda las cantidades", () => {
    expect(nameKey("Genil -Estilo pollo")).toBe("genil");
    expect(nameKey("Bolitas de queso y jalapeño (12 uds)")).toBe("bolitas queso jalapeno 12");
  });

  it("empareja sin cruzar productos parecidos", () => {
    const ours = [
      { id: "1", name: "Bolitas de queso (6 uds)" },
      { id: "2", name: "Bolitas de queso (12 uds)" },
      { id: "3", name: "Tafetén" },
      { id: "4", name: "Ración de patatas Tafetén" },
    ];
    const theirs = ["Bolitas Queso (12Uds)", "Bolitas Queso (6 Uds)", " Ta Fetén", "Patatas Táfetén"].map((name) => ({ name, description: "", priceCents: 0, imageId: null, allergens: [], diet: [] }));
    const m = Object.fromEntries(matchProducts(ours, theirs).map((x) => [x.product.id, x.last.name]));
    expect(m).toEqual({ "1": "Bolitas Queso (6 Uds)", "2": "Bolitas Queso (12Uds)", "3": " Ta Fetén", "4": "Patatas Táfetén" });
  });
});
