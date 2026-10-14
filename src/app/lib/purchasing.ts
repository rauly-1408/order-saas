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

// Texto del pedido tal como lo recibe el proveedor por WhatsApp o email.
export function supplierMessage(restaurant: string, contactName: string | null, orderNumber: number, lines: MessageLine[], notes?: string | null): string {
  const hello = contactName ? `Hola ${contactName},` : "Hola,";
  const body = lines.map((l) => {
    const packs = l.quantity / l.packSize;
    const packsText = Number.isInteger(Math.round(packs * 100) / 100) && packs >= 1 ? ` (${Math.round(packs)} × ${qtyText(l.packSize, l.baseUnit)})` : "";
    return `• ${l.name}: ${qtyText(l.quantity, l.baseUnit)}${packsText}`;
  });
  return [hello, "", `Os hago el pedido nº ${orderNumber} de ${restaurant}:`, ...body, ...(notes ? ["", notes] : []), "", "¡Gracias!"].join("\n");
}

// Enlace de WhatsApp con el mensaje escrito. Móviles españoles de 9 cifras → +34.
export function whatsappLink(phone: string, text: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9) digits = `34${digits}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(email: string, subject: string, text: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
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
