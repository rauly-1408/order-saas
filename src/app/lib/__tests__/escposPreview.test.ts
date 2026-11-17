import { describe, expect, it } from "vitest";
import { Escpos } from "../escpos";
import { previewEscpos } from "../escposPreview";

describe("previewEscpos", () => {
  it("devuelve el texto con acentos, alineación, negrita y tamaño", () => {
    const t = new Escpos({ width: 32 });
    t.align("center").bold(true).size(2, 2).line("Nº 12").size(1, 1).bold(false).align("left").row("1x Mollete", "2,50 €").cut();
    const p = previewEscpos(t.bytes());
    const text = p.lines.filter((l) => l.type === "text");
    expect(text[0]).toMatchObject({ text: "Nº 12", align: "center", bold: true, wide: true, tall: true });
    expect(text[1]).toMatchObject({ align: "left", bold: false, wide: false });
    expect(text[1].type === "text" && text[1].text).toBe("1x Mollete" + " ".repeat(32 - 10 - 6) + "2,50 €");
    expect(p.lines.at(-1)).toEqual({ type: "cut" });
    expect(p.drawer).toBe(false);
  });
  it("lee el QR y el cajón", () => {
    const t = new Escpos();
    t.qr("https://www2.agenciatributaria.gob.es/x?a=1").drawer().cut();
    const p = previewEscpos(t.bytes());
    expect(p.lines).toContainEqual({ type: "qr", data: "https://www2.agenciatributaria.gob.es/x?a=1" });
    expect(p.drawer).toBe(true);
  });
  it("sin acentos (ascii) no se inventa caracteres", () => {
    const t = new Escpos({ codepage: "ascii" });
    t.line("Café 3 €");
    const p = previewEscpos(t.bytes());
    expect(p.lines[0]).toMatchObject({ text: "Cafe 3 EUR" });
  });
});
