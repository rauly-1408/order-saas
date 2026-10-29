import { describe, expect, it } from "vitest";
import { applyQueue, pendingRoundsAsCuenta } from "@/app/admin/[tenant]/(panel)/mesas/offline";
import type { Pending } from "@/app/admin/[tenant]/(panel)/outbox";
import type { Table } from "@/app/admin/[tenant]/(panel)/mesas/shared";

// Mesas sin conexión: la cola del aparato pintada encima del último plano.
const base = "/api/admin/estafeten/mesas";
const free = (id: string): Table => ({ id, name: id.toUpperCase(), zone: "Interior", seats: 4, shape: "SQUARE", posX: null, posY: null, open: null });
const busy = (id: string, orderId: string, totalCents: number): Table => ({
  ...free(id),
  open: { orderId, orderNumber: 7, guests: 2, totalCents, openedAt: "2026-10-29T12:00:00.000Z", billRequested: false, waiter: "Ana", lines: 2, rounds: 1, lastRoundAt: null },
});
let n = 0;
const q = (url: string, body: Record<string, unknown>): Pending => ({ id: `p${++n}`, url, body, label: "", at: Date.parse("2026-10-29T13:00:00Z") + n });
const line = (name: string, totalCents: number, quantity = 1) => ({ name, quantity, totalCents, modifiers: [], note: null });

describe("Mesas sin conexión · la cola encima del plano", () => {
  it("abrir sin conexión con su primera ronda: mesa ocupada, sin número de cuenta", () => {
    const { tables, overlay } = applyQueue("estafeten", [free("m1")], [q(base, { action: "open", tableId: "m1", guests: 3, round: {}, preview: { lines: [line("Genil", 995, 1), line("Agua", 250, 2)] } })]);
    expect(tables[0].open).toMatchObject({ orderId: null, guests: 3, totalCents: 1245, lines: 3, rounds: 1, pending: true });
    expect(overlay.get("m1")?.rounds).toHaveLength(1);
  });

  it("ronda a una mesa abierta (por su cuenta) suma al total", () => {
    const { tables } = applyQueue("estafeten", [busy("m1", "o1", 2000)], [q(`${base}/o1`, { action: "round", preview: { lines: [line("Gula", 1395)] } })]);
    expect(tables[0].open).toMatchObject({ totalCents: 3395, rounds: 2, pending: true });
  });

  it("abierta sin conexión: otra ronda y cobro por la mesa, y queda libre", () => {
    const queue = [
      q(base, { action: "open", tableId: "m1", guests: 2, round: {}, preview: { lines: [line("Genil", 995)] } }),
      q(base, { action: "open", tableId: "m1", guests: 2, round: {}, preview: { lines: [line("Agua", 250)] } }),
      q(base, { action: "table", op: "pay", tableId: "m1", method: "CASH", preview: { totalCents: 1245 } }),
    ];
    const { tables, overlay } = applyQueue("estafeten", [free("m1")], queue);
    expect(tables[0].open).toBeNull();
    expect(overlay.get("m1")?.paidAll).toBe(true);
  });

  it("cobro por productos: baja lo que queda, la mesa sigue abierta", () => {
    const { tables, overlay } = applyQueue("estafeten", [busy("m1", "o1", 3000)], [q(`${base}/o1`, { action: "pay", method: "CARD_TERMINAL", units: [{ lineId: "l1", qty: 1 }], preview: { totalCents: 1000 } })]);
    expect(tables[0].open?.totalCents).toBe(2000);
    expect(overlay.get("m1")?.paidCents).toBe(1000);
  });

  it("cambio de mesa: la cuenta y lo pendiente pasan a la nueva; lo siguiente la sigue", () => {
    const queue = [
      q(`${base}/o1`, { action: "move", tableId: "m2" }),
      q(`${base}/o1`, { action: "round", preview: { lines: [line("Postre", 650)] } }),
    ];
    const { tables } = applyQueue("estafeten", [busy("m1", "o1", 2000), free("m2")], queue);
    expect(tables[0].open).toBeNull();
    expect(tables[1].open).toMatchObject({ orderId: "o1", totalCents: 2650 });
  });

  it("pedir la cuenta sin conexión la marca en ámbar", () => {
    const { tables } = applyQueue("estafeten", [busy("m1", "o1", 2000)], [q(base, { action: "table", op: "bill", tableId: "m1" })]);
    expect(tables[0].open?.billRequested).toBe(true);
  });

  it("lo rechazado por el servidor y lo de otros sitios no cuenta", () => {
    const queue = [{ ...q(`${base}/o1`, { action: "round", preview: { lines: [line("X", 100)] } }), error: "Mesa ya cobrada" }, q("/api/admin/estafeten/caja", { items: [] })];
    const { tables } = applyQueue("estafeten", [busy("m1", "o1", 2000)], queue);
    expect(tables[0].open?.totalCents).toBe(2000);
  });

  it("las rondas sin enviar se ven en la cuenta y no se pueden cobrar por separado", () => {
    const r = pendingRoundsAsCuenta([{ at: 0, lines: [line("Genil", 995)] }]);
    expect(r[0].round).toBe(-1);
    expect(r[0].lines[0].id.startsWith("pendiente-")).toBe(true);
  });
});
