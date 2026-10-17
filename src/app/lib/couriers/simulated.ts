// Modo prueba: un repartidor imaginario para probar el flujo sin contrato.
// No llama a nadie: el estado se calcula con el tiempo y con la cocina
// (no recoge hasta que el pedido está «Listo»), así funciona sin tareas
// programadas.
import type { CourierProvider, CourierUpdate, DeliveryContext } from "./types";

const MIN = 60_000;
export const SIMULATED_FEE_CENTS = 450;

export function simulatedStatus(d: DeliveryContext, now = Date.now()): CourierUpdate {
  const since = now - d.createdAt.getTime();
  const base = { courierName: "Repartidor de prueba", feeCents: SIMULATED_FEE_CENTS };
  if (d.orderStatus === "CANCELLED") return { ...base, status: "CANCELLED" };
  if (since < MIN) return { status: "REQUESTED", feeCents: SIMULATED_FEE_CENTS };
  if (d.orderStatus !== "READY" && d.orderStatus !== "DELIVERING" && d.orderStatus !== "DELIVERED") {
    return { ...base, status: since < 4 * MIN ? "ASSIGNED" : "AT_PICKUP" };
  }
  // Desde que la cocina lo marca «Listo»: recoge al minuto y entrega a los 8.
  const sinceReady = now - d.orderUpdatedAt.getTime();
  if (d.orderStatus === "READY" && sinceReady < MIN) return { ...base, status: "AT_PICKUP" };
  if (d.orderStatus === "DELIVERED" || sinceReady >= 8 * MIN) return { ...base, status: "DELIVERED" };
  return { ...base, status: sinceReady >= 5 * MIN ? "NEAR_CUSTOMER" : "PICKED_UP", dropoffEta: new Date(d.orderUpdatedAt.getTime() + 8 * MIN) };
}

export const simulatedProvider: CourierProvider = {
  async request(input) {
    const now = Date.now();
    return {
      externalId: `sim_${input.orderId}`,
      status: "REQUESTED",
      feeCents: SIMULATED_FEE_CENTS,
      pickupEta: new Date(now + 12 * MIN),
      dropoffEta: new Date(now + 30 * MIN),
    };
  },
  async fetch(d) {
    return simulatedStatus(d);
  },
  async cancel() {},
};
