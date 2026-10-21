import { describe, expect, it } from "vitest";
import { availableSlots, scheduleProblem, SLOT_STEP_MIN } from "@/app/lib/schedule";
import { openAt, parseHours } from "@/app/lib/storeStatus";
import { normalizeDomain } from "@/app/lib/domains";
import { lineMismatch, sanitizeScan } from "@/app/lib/invoice";

const tz = "Europe/Madrid";
// Abierto todos los días de 20:00 a 23:30.
const hours = parseHours(Object.fromEntries(["lun", "mar", "mie", "jue", "vie", "sab", "dom"].map((d) => [d, [{ from: "20:00", to: "23:30" }]])));
const input = { hours, closures: [], pausedUntil: null };
const now = new Date("2026-10-21T18:00:00Z"); // 20:00 en Madrid (horario de verano)

describe("horario", () => {
  it("abierto dentro de la franja y cerrado fuera", () => {
    expect(openAt(hours, 3, 20 * 60)).toBe(true);
    expect(openAt(hours, 3, 23 * 60 + 29)).toBe(true);
    expect(openAt(hours, 3, 23 * 60 + 30)).toBe(false);
    expect(openAt(hours, 3, 12 * 60)).toBe(false);
  });
});

describe("pedidos programados", () => {
  const slots = availableSlots(input, now, tz, 20);
  it("empieza en ahora + preparación y acaba cuando la cocina ya no llega", () => {
    expect(slots[0]).toMatchObject({ day: "Hoy", time: "20:20" });
    const today = slots.filter((s) => s.day === "Hoy");
    expect(today[today.length - 1].time).toBe("23:25");
    expect(slots.some((s) => s.day === "Mañana")).toBe(true);
    expect(slots.every((s) => Number(s.time.slice(3)) % SLOT_STEP_MIN === 0)).toBe(true);
  });
  it("rechaza horas pasadas, desalineadas o con la tienda cerrada", () => {
    expect(scheduleProblem(input, new Date("2026-10-21T17:00:00Z"), now, tz, 20)).toContain("no llega a tiempo");
    expect(scheduleProblem(input, new Date("2026-10-21T19:03:00Z"), now, tz, 20)).toContain("no es válida");
    expect(scheduleProblem(input, new Date("2026-10-22T10:00:00Z"), now, tz, 20)).toContain("no estamos abiertos");
    expect(scheduleProblem(input, new Date("2026-10-21T19:30:00Z"), now, tz, 20)).toBeNull();
  });
  it("con la tienda en pausa no hay huecos hasta que acabe", () => {
    const paused = availableSlots({ ...input, pausedUntil: new Date("2026-10-21T20:00:00Z") }, now, tz, 20);
    expect(paused[0]).toMatchObject({ day: "Hoy", time: "22:20" });
  });
});

describe("dominios", () => {
  it("normaliza y rechaza lo que no vale", () => {
    expect(normalizeDomain(" https://Pedidos.Estafeten.com/ ")).toBe("pedidos.estafeten.com");
    expect(normalizeDomain("estafeten.com")).toBe("estafeten.com");
    expect(normalizeDomain("algo.vercel.app")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(normalizeDomain("no es un dominio")).toBeNull();
  });
});

describe("albaranes", () => {
  it("avisa cuando cantidad × precio no cuadra con el importe", () => {
    expect(lineMismatch({ quantity: 10000, packPriceCents: 1200, lineTotalCents: 2400 }, 5000)).toBe(false);
    expect(lineMismatch({ quantity: 10000, packPriceCents: 1200, lineTotalCents: 3000 }, 5000)).toBe(true);
    expect(lineMismatch({ quantity: null, packPriceCents: 1200, lineTotalCents: 3000 }, 5000)).toBe(false);
  });
  it("limpia la respuesta de la IA: ids desconocidos fuera, ingrediente nuevo validado", () => {
    const r = sanitizeScan(
      {
        supplierId: "nope",
        supplierName: " Genil SL ",
        lines: [
          { description: "Pollo entero", ingredientId: "nope", newIngredient: { name: "Pollo entero", baseUnit: "G", packSize: 5000, packPriceCents: 1200.4, allergens: ["gluten", "x"] }, quantity: 10000, packPriceCents: null, lineTotalCents: 2400, note: null },
          { description: "", ingredientId: null, newIngredient: null, quantity: 1, packPriceCents: 1, lineTotalCents: 1, note: null },
          { description: "Mal", ingredientId: null, newIngredient: { name: "X", baseUnit: "LITROS", packSize: 1, packPriceCents: 1, allergens: [] }, quantity: 1, packPriceCents: 1, lineTotalCents: 1, note: null },
        ],
      },
      [{ id: "i1", name: "Boniato", baseUnit: "G", packSize: 1000, packPriceCents: 300, supplierId: null }],
      []
    );
    expect(r.supplierId).toBeNull();
    expect(r.supplierName).toBe("Genil SL");
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].ingredientId).toBeNull();
    expect(r.lines[0].newIngredient).toEqual({ name: "Pollo entero", baseUnit: "G", packSize: 5000, packPriceCents: 1200, allergens: ["Gluten"] });
    expect(r.lines[1].newIngredient).toBeNull();
  });
});
