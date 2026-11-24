import { describe, expect, it } from "vitest";
import { resolveRoute, splitRoutes, MANUAL_SECTIONS } from "@/app/admin/[tenant]/(panel)/panelLinks";
import { parseManual, searchManual, loadManual } from "../manual";

describe("enlaces de las rutas del panel", () => {
  it("resuelve apartado, pestaña y subapartado de configuración", () => {
    expect(resolveRoute("Carta → Productos", "demo")).toEqual({ href: "/admin/demo/carta?tab=productos", tab: "productos" });
    expect(resolveRoute("Costes → Inventario", "demo")).toEqual({ href: "/admin/demo/costes?tab=inventario", tab: "inventario" });
    expect(resolveRoute("Configuración → Impresoras", "demo")).toEqual({ href: "/admin/demo/configuracion/impresoras" });
    expect(resolveRoute("Configuración → Facturación · VeriFactu", "demo")?.href).toBe("/admin/demo/configuracion/facturacion");
    expect(resolveRoute("Menú → Caja", "demo")).toEqual({ href: "/admin/demo/caja" });
    expect(resolveRoute("Día a día → Pantalla de cocina", "demo")).toEqual({ href: "/admin/demo/cocina" });
    expect(resolveRoute("Ayuda → Caja", "demo")?.href).toBe("/admin/demo/ayuda#caja");
  });
  it("no inventa enlaces", () => {
    expect(resolveRoute("Ajustes → Cosas", "demo")).toBeNull();
    expect(resolveRoute("Carta → Inventada", "demo")).toEqual({ href: "/admin/demo/carta" });
  });
  it("trocea el texto: rutas en negrita enteras y «Apartado → pestaña» en texto normal", () => {
    expect(splitRoutes("Costes → Inventario", "demo", true)).toEqual([{ text: "Costes → Inventario", route: { href: "/admin/demo/costes?tab=inventario", tab: "inventario" } }]);
    const p = splitRoutes("Entra en Carta → Productos y toca el producto.", "demo");
    expect(p.map((x) => x.text)).toEqual(["Entra en ", "Carta → Productos", " y toca el producto."]);
    expect(p[1].route?.href).toBe("/admin/demo/carta?tab=productos");
    // Una palabra suelta en texto normal no se enlaza («la caja está cerrada»).
    expect(splitRoutes("la caja está cerrada", "demo")).toEqual([{ text: "la caja está cerrada" }]);
    // Una negrita que no es un apartado tampoco.
    expect(splitRoutes("Total: 12 €", "demo", true)).toEqual([{ text: "Total: 12 €" }]);
  });
});

describe("manual", () => {
  const md = `# Caja\n\nPara vender en el local.\n\n**Dónde:** Menú → Caja\n\n## Abrir la caja\n\n1. Entra en **Caja**.\n2. Pon el fondo.\n\n## Cerrar la caja\n\nCuenta el cajón y toca «Cerrar caja».\n`;
  it("separa la introducción y cada tema", () => {
    const s = parseManual("caja", "Caja", md);
    expect(s.title).toBe("Caja");
    expect(s.intro).toMatch(/Para vender/);
    expect(s.entries.map((e) => e.title)).toEqual(["Abrir la caja", "Cerrar la caja"]);
    expect(s.entries[0].id).toBe("caja-abrir-la-caja");
  });
  it("busca aunque se pregunte con otras formas de la palabra", () => {
    const m = [parseManual("caja", "Caja", md)];
    expect(searchManual("¿cómo abro la caja?", m)[0].title).toBe("Abrir la caja");
    expect(searchManual("cerrando caja", m)[0].title).toBe("Cerrar la caja");
    expect(searchManual("receta de paella", m)).toEqual([]);
  });
  it("el manual real tiene todas las secciones con temas", () => {
    const real = loadManual();
    expect(real.map((s) => s.slug)).toEqual(MANUAL_SECTIONS.map(([s]) => s));
    for (const s of real) expect(s.entries.length).toBeGreaterThan(2);
    const ids = real.flatMap((s) => s.entries.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
