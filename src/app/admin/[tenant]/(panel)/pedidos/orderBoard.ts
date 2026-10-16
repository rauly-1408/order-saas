// Configuración del tablero de pedidos: tipos, columnas, siguiente acción y
// semáforo del temporizador. Sin React — solo datos y funciones puras.

export type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  totalCents: number;
  modifiers: unknown; // JSON snapshot: OrderLineModifier[] (ver lib/menuOptions)
};

export type Order = {
  id: string;
  orderNumber: number | null;
  status: string;
  channel: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  notes: string | null;
  totalCents: number;
  discountCents?: number;
  coupon?: { code: string } | null;
  promotion?: { name: string } | null;
  promotionDiscountCents?: number;
  loyaltyDiscountCents?: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
};

export type Estimates = { deliveryMinutes: number; pickupMinutes: number };

export type ColumnKey = "NEW" | "PREPARING" | "READY" | "DELIVERING";

export type Column = {
  key: ColumnKey;
  label: string;
  emoji: string;
  statuses: string[];
  accent: string; // clases Tailwind del acento de la columna
};

// ACCEPTED se agrupa con los nuevos: el panel ya no lo usa, pero puede haber
// pedidos antiguos en ese estado.
export const COLUMNS: Column[] = [
  { key: "NEW", label: "Nuevos", emoji: "🔔", statuses: ["CREATED", "ACCEPTED"], accent: "text-[var(--p-accent)]" },
  { key: "PREPARING", label: "Preparando", emoji: "🔥", statuses: ["PREPARING"], accent: "text-amber-600" },
  { key: "READY", label: "Listos", emoji: "✅", statuses: ["READY"], accent: "text-emerald-600" },
  { key: "DELIVERING", label: "En reparto", emoji: "🛵", statuses: ["DELIVERING"], accent: "text-sky-600" },
];

export type NextAction = { status: string; label: string };

// Una sola acción principal por tarjeta.
export function nextAction(order: Order): NextAction | null {
  switch (order.status) {
    case "CREATED":
    case "ACCEPTED":
      return { status: "PREPARING", label: "Aceptar" };
    case "PREPARING":
      return { status: "READY", label: "Marcar listo" };
    case "READY":
      return order.channel === "DELIVERY"
        ? { status: "DELIVERING", label: "Enviar a reparto" }
        : { status: "DELIVERED", label: "Entregado" };
    case "DELIVERING":
      return { status: "DELIVERED", label: "Entregado" };
    default:
      return null;
  }
}

export function canCancel(order: Order): boolean {
  return ["CREATED", "ACCEPTED", "PREPARING"].includes(order.status);
}

export type TimerTone = "ok" | "warn" | "late";

// Semáforo: verde < 70% del tiempo estimado, naranja hasta el 100%, rojo pasado.
export function timerTone(order: Order, estimates: Estimates, now: number): TimerTone {
  const limitMin = order.channel === "DELIVERY" ? estimates.deliveryMinutes : estimates.pickupMinutes;
  const elapsedMin = (now - new Date(order.createdAt).getTime()) / 60_000;
  const ratio = elapsedMin / limitMin;
  if (ratio >= 1) return "late";
  if (ratio >= 0.7) return "warn";
  return "ok";
}

export function elapsedLabel(fromIso: string, now: number): string {
  const secs = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)} min`;
  return `${Math.floor(secs / 3600)} h ${Math.floor((secs % 3600) / 60)} min`;
}

export { modifierLabels } from "@/app/lib/menuOptions";

// "612345678" -> "612 34 56 78"; "+34612345678" -> "+34 612 34 56 78".
// Si no es un número español de 9 dígitos, se devuelve tal cual.
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("34") ? digits.slice(2) : digits.length === 13 && digits.startsWith("0034") ? digits.slice(4) : digits;
  if (local.length !== 9) return raw;
  const pretty = `${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7)}`;
  return local === digits ? pretty : `+34 ${pretty}`;
}

export function orderLabel(order: Order): string {
  return order.orderNumber != null ? `#${order.orderNumber}` : order.id.slice(0, 6).toUpperCase();
}

export const toEuros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
