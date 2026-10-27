import { describe, expect, it } from "vitest";
import { addMonths, commissionCents, monthOf, monthStart, normalizeCollabCode, parseCollaborator, validCollabCode } from "../collaborators";

// Colaboradores: código, lo que se lleva y los meses en hora de Madrid.
describe("Colaboradores", () => {
  it("el código va en mayúsculas, sin acentos ni espacios", () => {
    expect(normalizeCollabCode(" Laura Pub ")).toBe("LAURAPUB");
    expect(normalizeCollabCode("María-José")).toBe("MARIAJOSE");
    expect(validCollabCode("LA")).toBe(false);
    expect(validCollabCode("LAURA")).toBe(true);
  });
  it("se lleva su % de lo pedido", () => {
    expect(commissionCents(3000_00, 10)).toBe(300_00); // 3000 € → 300 €
    expect(commissionCents(1995, 10)).toBe(200);
    expect(commissionCents(0, 10)).toBe(0);
    expect(commissionCents(1000, 0)).toBe(0);
  });
  it("los meses van en hora de Madrid", () => {
    const tz = "Europe/Madrid";
    // 31 de octubre a las 23:30 en Madrid (22:30 UTC) es octubre; a las 00:30 (23:30 UTC), noviembre.
    expect(monthOf(new Date("2026-10-31T22:30:00Z"), tz)).toBe("2026-10");
    expect(monthOf(new Date("2026-10-31T23:30:00Z"), tz)).toBe("2026-11");
    expect(monthStart("2026-11", tz).toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(monthStart("2026-07", tz).toISOString()).toBe("2026-06-30T22:00:00.000Z");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("valida los datos del panel", () => {
    expect(parseCollaborator({ name: "", commissionPct: 10 })).toBe("Escribe el nombre");
    expect(parseCollaborator({ name: "Laura", commissionPct: 80 })).toBe("El porcentaje tiene que estar entre 1 y 50");
    expect(parseCollaborator({ name: "Laura", place: "Pub La Charca", commissionPct: "10" })).toMatchObject({ name: "Laura", code: "LAURA", commissionPct: 10, place: "Pub La Charca" });
  });
});

import { bestDiscount, collaboratorDiscountCents } from "../collaboratorDiscount";

describe("descuento para el cliente del colaborador", () => {
  it("un 5 % de 30 € son 1,50 €; sin % no hay descuento", () => {
    expect(collaboratorDiscountCents(3000, 5)).toBe(150);
    expect(collaboratorDiscountCents(3000, 0)).toBe(0);
  });
  it("no se acumula: gana el que más ahorra", () => {
    expect(bestDiscount(0, 0, 150)).toBe("collab");
    expect(bestDiscount(200, 0, 150)).toBe("promo");
    expect(bestDiscount(0, 300, 150)).toBe("coupon");
    expect(bestDiscount(0, 0, 0)).toBeNull();
  });
  it("a igualdad, como antes: promoción o cupón antes que el colaborador", () => {
    expect(bestDiscount(150, 0, 150)).toBe("promo");
    expect(bestDiscount(0, 150, 150)).toBe("coupon");
    expect(bestDiscount(150, 150, 0)).toBe("coupon");
  });
});
