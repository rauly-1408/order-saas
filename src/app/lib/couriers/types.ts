// Tipos comunes del repartidor externo. Cada proveedor (modo prueba, Glovo
// On-Demand…) traduce sus estados a CourierStatus. Ver docs/REPARTO-EXTERNO.md

export const PROVIDERS = ["NONE", "SIMULATED", "GLOVO"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  NONE: "Desactivado",
  SIMULATED: "Modo prueba",
  GLOVO: "Glovo On-Demand",
};

export type CourierStatus = "REQUESTED" | "ASSIGNED" | "AT_PICKUP" | "PICKED_UP" | "NEAR_CUSTOMER" | "DELIVERED" | "CANCELLED" | "FAILED";
// Estados en los que el viaje sigue vivo (se puede consultar o cancelar).
export const ACTIVE_STATUSES: CourierStatus[] = ["REQUESTED", "ASSIGNED", "AT_PICKUP", "PICKED_UP", "NEAR_CUSTOMER"];

export type GeoPoint = { lat: number; lng: number; address: string };

export type DispatchInput = {
  orderId: string;
  orderLabel: string; // "#28": código que el repartidor dice al recoger
  pickup: { name: string; phone: string | null; location: GeoPoint };
  dropoff: { name: string; phone: string; location: GeoPoint; notes: string | null };
  description: string;
  amountCents: number;
  paid: boolean; // false = el cliente paga al recibirlo
  deliverAt: Date | null; // pedido programado
};

export type CourierUpdate = {
  externalId?: string;
  status: CourierStatus;
  rawStatus?: string | null;
  feeCents?: number | null;
  trackingUrl?: string | null;
  courierName?: string | null;
  courierPhone?: string | null;
  pickupEta?: Date | null;
  dropoffEta?: Date | null;
};

// Consulta o aviso: status null = sin cambio de estado (p. ej. «retrasado»).
export type CourierPatch = Omit<CourierUpdate, "status"> & { status: CourierStatus | null };

export type AccountContext = { tenantId: string; config: Record<string, unknown>; secrets: Record<string, string> };
// Lo que el proveedor necesita saber del pedido al consultar un viaje.
export type DeliveryContext = { externalId: string; createdAt: Date; orderStatus: string; orderUpdatedAt: Date };

export interface CourierProvider {
  request(input: DispatchInput, account: AccountContext): Promise<CourierUpdate>;
  fetch(delivery: DeliveryContext, account: AccountContext): Promise<CourierPatch>;
  cancel(externalId: string, account: AccountContext): Promise<void>;
}

export class CourierError extends Error {}
