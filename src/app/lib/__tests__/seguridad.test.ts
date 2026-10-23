import { describe, expect, it } from "vitest";
import { cleanText } from "../text";
import { Escpos } from "../escpos";
import { isPrinterAddress } from "../printing";

describe("Seguridad · texto del cliente", () => {
  it("quita caracteres de control y recorta", () => {
    expect(cleanText("Ana\u001bp0\u0019\u0019 María", 80)).toBe("Ana p0 María");
    expect(cleanText("x".repeat(500), 300)).toHaveLength(300);
    expect(cleanText(42, 10)).toBe("");
  });
  it("el ticket nunca lleva ESC ni GS dentro del texto", () => {
    const bytes = new Escpos().line("Nota \u001bp0\u0019\u0019 \u001dV\u0001 fin").bytes();
    // Tras la inicialización (ESC @ y ESC t n) no debe aparecer ningún 0x1b/0x1d salvo el salto final.
    const body = Array.from(bytes).slice(5);
    expect(body.includes(0x1b)).toBe(false);
    expect(body.includes(0x1d)).toBe(false);
  });
});

describe("Seguridad · impresoras solo en la red del local", () => {
  it("acepta IPs privadas y puertos de impresión", () => {
    expect(isPrinterAddress("192.168.1.31", 9100)).toBe(true);
    expect(isPrinterAddress("10.0.0.5", 9101)).toBe(true);
    expect(isPrinterAddress("172.20.1.2", 9100)).toBe(true);
  });
  it("rechaza internet, nombres, otros puertos y direcciones raras", () => {
    expect(isPrinterAddress("8.8.8.8", 9100)).toBe(false);
    expect(isPrinterAddress("172.32.0.1", 9100)).toBe(false);
    expect(isPrinterAddress("printer.local", 9100)).toBe(false);
    expect(isPrinterAddress("192.168.1.31", 80)).toBe(false);
    expect(isPrinterAddress("192.168.1.31", 6379)).toBe(false);
    expect(isPrinterAddress("192.168.1.300", 9100)).toBe(false);
  });
});
