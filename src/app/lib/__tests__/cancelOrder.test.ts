import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import { customerCanCancel, SCHEDULED_CANCEL_MARGIN_MS } from "@/app/lib/cancelOrder";

// Regla de cancelación del cliente (ver docs/SEGUIMIENTO-Y-RESENAS.md).
const now = new Date("2026-10-24T12:00:00Z");
const inMs = (ms: number) => new Date(now.getTime() + ms);

describe("customerCanCancel", () => {
  it("un pedido nuevo (sin aceptar) siempre se puede cancelar", () => {
    expect(customerCanCancel({ status: "CREATED", scheduledFor: null }, now)).toBe(true);
  });

  it("aceptado o en cocina sin programar: ya no", () => {
    expect(customerCanCancel({ status: "ACCEPTED", scheduledFor: null }, now)).toBe(false);
    expect(customerCanCancel({ status: "PREPARING", scheduledFor: null }, now)).toBe(false);
  });

  it("programado: hasta una hora antes aunque esté aceptado o en cocina", () => {
    expect(customerCanCancel({ status: "PREPARING", scheduledFor: inMs(3 * 3_600_000) }, now)).toBe(true);
    expect(customerCanCancel({ status: "ACCEPTED", scheduledFor: inMs(SCHEDULED_CANCEL_MARGIN_MS) }, now)).toBe(true);
    expect(customerCanCancel({ status: "PREPARING", scheduledFor: inMs(SCHEDULED_CANCEL_MARGIN_MS - 1) }, now)).toBe(false);
    expect(customerCanCancel({ status: "PREPARING", scheduledFor: inMs(-60_000) }, now)).toBe(false);
  });

  it("listo, en reparto, entregado o cancelado: nunca, ni programado", () => {
    for (const status of ["READY", "DELIVERING", "DELIVERED", "CANCELLED"] as OrderStatus[]) {
      expect(customerCanCancel({ status, scheduledFor: inMs(5 * 3_600_000) }, now)).toBe(false);
      expect(customerCanCancel({ status, scheduledFor: null }, now)).toBe(false);
    }
  });
});
