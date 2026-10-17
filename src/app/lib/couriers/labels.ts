// Textos del repartidor externo para el panel y el seguimiento del cliente.
// Sin dependencias de servidor: se usa también en componentes de cliente.
import type { Lang } from "@/app/lib/i18n";

export type CourierView = {
  provider: "NONE" | "SIMULATED" | "GLOVO";
  status: string;
  feeCents: number | null;
  trackingUrl: string | null;
  courierName: string | null;
  pickupEta: string | null;
  dropoffEta: string | null;
  error: string | null;
};

export const PROVIDER_NAME: Record<CourierView["provider"], string> = { NONE: "", SIMULATED: "Modo prueba", GLOVO: "Glovo" };

const PANEL: Record<string, string> = {
  REQUESTED: "Buscando repartidor…",
  ASSIGNED: "Repartidor asignado",
  AT_PICKUP: "Repartidor en el local",
  PICKED_UP: "Recogido · en camino",
  NEAR_CUSTOMER: "Llegando al cliente",
  DELIVERED: "Entregado",
  CANCELLED: "Repartidor cancelado",
  FAILED: "No se pudo pedir el repartidor",
};

export const courierPanelLabel = (status: string) => PANEL[status] ?? status;
export const courierCanCancel = (status: string) => ["REQUESTED", "ASSIGNED", "AT_PICKUP"].includes(status);
export const courierCanRetry = (status: string) => status === "FAILED" || status === "CANCELLED";

// Para el cliente: solo cuando aporta algo (repartidor en camino o cerca).
const CUSTOMER: Record<Lang, Record<string, string>> = {
  es: { ASSIGNED: "Ya hay repartidor para tu pedido", AT_PICKUP: "El repartidor está recogiendo tu pedido", PICKED_UP: "Tu pedido va de camino", NEAR_CUSTOMER: "El repartidor está llegando" },
  en: { ASSIGNED: "A courier has been assigned", AT_PICKUP: "The courier is picking up your order", PICKED_UP: "Your order is on its way", NEAR_CUSTOMER: "The courier is almost there" },
};

export const courierCustomerLabel = (status: string, lang: Lang): string | null => CUSTOMER[lang][status] ?? null;
