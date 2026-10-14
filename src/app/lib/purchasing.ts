// Compras del módulo Costes (fase 3): sugerencia de pedido, mensaje para el
// proveedor y registro de cambios de precio. Las funciones puras se usan en
// cliente y servidor; recordPriceChange corre dentro de transacciones Prisma.
import type { BaseUnit, PriceChangeSource, Prisma } from "@prisma/client";
import { unitCostCents } from "@/app/lib/costs";

type Tx = Prisma.TransactionClient;

export type StockInfo = { trackStock: boolean; stockQty: number; minStock: number | null; packSize: number };

// Cantidad sugerida para reponer: llevar el stock al doble del mínimo, en
// formatos completos (no se compra media caja). 0 si no hace falta.
export function suggestedOrderQty(i: StockInfo): number {
  if (!i.trackStock || i.minStock == null || !(i.packSize > 0)) return 0;
  if (i.stockQty > i.minStock) return 0;
  const need = i.minStock * 2 - i.stockQty;
  if (need <= 0) return 0;
  return Math.ceil(need / i.packSize - 1e-9) * i.packSize;
}

const UNIT: Record<BaseUnit, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "ud" };

function qtyText(qty: number, unit: BaseUnit): string {
  const n = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  if (unit === "G" && qty >= 1000) return `${n(qty / 1000)} kg`;
  if (unit === "ML" && qty >= 1000) return `${n(qty / 1000)} l`;
  return `${n(qty)} ${UNIT[unit]}`;
}

export type MessageLine = { name: string; quantity: number; baseUnit: BaseUnit; packSize: number };

// ── Reparto del proveedor ───────────────────────────────────────────────
// Días ISO: 1 = lunes … 7 = domingo.

export type DeliverySchedule = { deliveryDays: number[]; leadDays: number; orderCutoff: string | null };

export const DAY_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const DAY_NAME = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function cutoffMinutes(cutoff: string | null): number {
  const m = cutoff ? /^(\d{1,2}):(\d{2})$/.exec(cutoff) : null;
  return m ? Math.min(+m[1], 23) * 60 + Math.min(+m[2], 59) : 24 * 60 - 1;
}

// Días que faltan hasta la próxima entrega a la que aún se llega pidiendo
// ahora (0 = hoy), o null si el proveedor no tiene días de reparto.
// Una entrega del día D exige pedir antes de las `orderCutoff` del día D − leadDays.
export function nextDeliveryOffset(todayIsoWeekday: number, nowMinutes: number, s: DeliverySchedule): number | null {
  const days = new Set(s.deliveryDays.filter((d) => d >= 1 && d <= 7));
  if (!days.size) return null;
  const lead = Math.max(0, s.leadDays);
  for (let k = 0; k <= 7 + lead + 7; k++) {
    const weekday = ((todayIsoWeekday - 1 + k) % 7) + 1;
    if (!days.has(weekday)) continue;
    const daysUntilDeadline = k - lead;
    if (daysUntilDeadline > 0 || (daysUntilDeadline === 0 && nowMinutes <= cutoffMinutes(s.orderCutoff))) return k;
  }
  return null;
}

// "Reparte L y J · pedir 1 día antes, hasta las 12:00"
export function deliverySummary(s: DeliverySchedule): string | null {
  const days = [...new Set(s.deliveryDays)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (!days.length) return null;
  const list = days.map((d) => DAY_SHORT[d - 1]);
  const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}` : list[0];
  const lead = s.leadDays <= 0 ? "pedir el mismo día" : s.leadDays === 1 ? "pedir 1 día antes" : `pedir ${s.leadDays} días antes`;
  return `Reparte ${joined} · ${lead}${s.orderCutoff ? `, hasta las ${s.orderCutoff}` : ""}`;
}

// "lunes 19 de octubre"
export function deliveryDateText(date: Date): string {
  const wd = (date.getDay() + 6) % 7;
  return `${DAY_NAME[wd]} ${date.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`;
}

// Número al que se manda el pedido por WhatsApp.
export function supplierWhatsapp(s: { whatsapp: string | null; phone: string | null }): string | null {
  return s.whatsapp || s.phone || null;
}

// Texto del pedido tal como lo recibe el proveedor por WhatsApp o email.
export function supplierMessage(restaurant: string, contactName: string | null, orderNumber: number, lines: MessageLine[], notes?: string | null, deliveryText?: string | null): string {
  const hello = contactName ? `Hola ${contactName},` : "Hola,";
  const body = lines.map((l) => {
    const packs = l.quantity / l.packSize;
    const packsText = Number.isInteger(Math.round(packs * 100) / 100) && packs >= 1 ? ` (${Math.round(packs)} × ${qtyText(l.packSize, l.baseUnit)})` : "";
    return `• ${l.name}: ${qtyText(l.quantity, l.baseUnit)}${packsText}`;
  });
  return [
    hello,
    "",
    `Os hago el pedido nº ${orderNumber} de ${restaurant}:`,
    ...body,
    ...(deliveryText ? ["", `Para entregar el ${deliveryText}.`] : []),
    ...(notes ? ["", notes] : []),
    "",
    "¡Gracias!",
  ].join("\n");
}

// Enlace de WhatsApp con el mensaje escrito. Móviles españoles de 9 cifras → +34.
export function whatsappLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `34${digits}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string, subject: string, text: string, cc: string[] = []): string {
  const ccPart = cc.length ? `&cc=${cc.map(encodeURIComponent).join(",")}` : "";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}${ccPart}&body=${encodeURIComponent(text)}`;
}

// Variación del coste útil (por unidad base) entre dos precios de compra, en %.
export function priceChangePct(c: { oldPackSize: number; oldPackPriceCents: number; newPackSize: number; newPackPriceCents: number }): number {
  const before = unitCostCents({ packSize: c.oldPackSize, packPriceCents: c.oldPackPriceCents, wastePct: 0 });
  const after = unitCostCents({ packSize: c.newPackSize, packPriceCents: c.newPackPriceCents, wastePct: 0 });
  return before > 0 ? ((after - before) / before) * 100 : 0;
}

// Registra el cambio solo si cambia el coste por unidad (cambiar 1 kg a 10 € por
// 2 kg a 20 € no es una subida).
export async function recordPriceChange(
  tx: Tx,
  tenantId: string,
  ingredientId: string,
  before: { packSize: number; packPriceCents: number },
  after: { packSize: number; packPriceCents: number },
  source: PriceChangeSource
): Promise<void> {
  const change = { oldPackSize: before.packSize, oldPackPriceCents: before.packPriceCents, newPackSize: after.packSize, newPackPriceCents: after.packPriceCents };
  if (Math.abs(priceChangePct(change)) < 0.01) return;
  await tx.ingredientPriceChange.create({ data: { tenantId, ingredientId, source, ...change } });
}
