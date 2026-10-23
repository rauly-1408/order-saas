import { describe, expect, it } from "vitest";
import { altaHash, amount, invoiceTotalOf, issueDateOf, qrUrlOf, readVerifactu, splitTax, timestampOf } from "../verifactu";

// Ejemplos de la especificación de la AEAT para el cálculo de la huella.
describe("VeriFactu · huella", () => {
  it("primer registro (sin huella anterior)", () => {
    expect(
      altaHash({ nif: "89890001K", numSerie: "12345678/G33", issueDate: "01-01-2024", invoiceType: "F1", taxCents: 1235, totalCents: 12345, prevHash: null, genTimestamp: "2024-01-01T19:20:30+01:00" })
    ).toBe("3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  });
  it("registro encadenado con el anterior", () => {
    expect(
      altaHash({
        nif: "89890001K",
        numSerie: "12345679/G34",
        issueDate: "01-01-2024",
        invoiceType: "F1",
        taxCents: 1235,
        totalCents: 12345,
        prevHash: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60",
        genTimestamp: "2024-01-01T19:20:35+01:00",
      })
    ).toBe("F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97");
  });
});

describe("VeriFactu · formatos", () => {
  it("importes con punto y dos decimales, también negativos", () => {
    expect(amount(12345)).toBe("123.45");
    expect(amount(5)).toBe("0.05");
    expect(amount(-500)).toBe("-5.00");
    expect(amount(0)).toBe("0.00");
  });
  it("fecha y hora con el huso de Madrid (verano e invierno)", () => {
    const summer = new Date("2026-10-23T16:20:30Z");
    expect(issueDateOf(summer, "Europe/Madrid")).toBe("23-10-2026");
    expect(timestampOf(summer, "Europe/Madrid")).toBe("2026-10-23T18:20:30+02:00");
    const winter = new Date("2026-12-31T23:30:00Z");
    expect(issueDateOf(winter, "Europe/Madrid")).toBe("01-01-2027");
    expect(timestampOf(winter, "Europe/Madrid")).toBe("2027-01-01T00:30:00+01:00");
  });
  it("QR de cotejo con la fecha y el importe del registro", () => {
    expect(qrUrlOf("PRUEBAS", "B12345678", "T2026-000001", "23-10-2026", 1250)).toBe("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=T2026-000001&fecha=23-10-2026&importe=12.50");
    expect(qrUrlOf("PRODUCCION", "B12345678", "1/25A", "05-01-2025", 56700)).toContain("www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=1%2F25A&fecha=05-01-2025&importe=567.00");
  });
});

describe("VeriFactu · importes de la factura", () => {
  it("base y cuota de un importe con IVA incluido", () => {
    expect(splitTax(1100, 10)).toEqual({ baseCents: 1000, taxCents: 100 });
    expect(splitTax(895, 10)).toEqual({ baseCents: 814, taxCents: 81 });
  });
  it("la propina no se factura y la tarjeta regalo sí", () => {
    expect(invoiceTotalOf({ totalCents: 1500, tipCents: 100, giftCardCents: 0 })).toBe(1400);
    expect(invoiceTotalOf({ totalCents: 500, tipCents: 0, giftCardCents: 1000 })).toBe(1500);
  });
  it("apagado por defecto y la serie «R» queda para rectificativas", () => {
    expect(readVerifactu({}).enabled).toBe(false);
    expect(readVerifactu({ verifactu: { enabled: true, seriesPrefix: "R" } }).seriesPrefix).toBe("T");
  });
});
