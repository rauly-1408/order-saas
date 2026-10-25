import type { Prisma } from "@prisma/client";
import { cleanText } from "./text";
import type { ConsumptionItem } from "./inventory";
import { invalidLine, priceOrderItems, type OrderLineInput } from "./orderPricing";
import { CUSTOM_PRODUCT_ID } from "./tables";

// Prepara las líneas de una ronda de mesa: productos de la carta (con precio
// del servidor) y productos libres (un chupito, una invitación…), sin carta ni
// stock. Lo usan «Nueva ronda» y abrir una mesa sin conexión. Ver docs/MESAS.md

export type CustomInput = { name?: unknown; quantity?: unknown; priceCents?: unknown; note?: unknown; free?: unknown };
export type RoundInput = { items?: OrderLineInput[]; custom?: CustomInput[] };
export type PreparedRound = { lines: Prisma.OrderLineCreateWithoutOrderInput[]; consumption: ConsumptionItem[] };

export async function prepareRound(tenantId: string, b: RoundInput, allowDiscount: boolean): Promise<PreparedRound | { error: string }> {
  const items = Array.isArray(b.items) ? b.items : [];
  const custom = Array.isArray(b.custom) ? b.custom.slice(0, 20) : [];
  const customLines: Prisma.OrderLineCreateWithoutOrderInput[] = [];
  for (const c of custom) {
    const name = cleanText(c?.name, 60);
    const quantity = Number(c?.quantity);
    const price = c?.free === true ? 0 : Number(c?.priceCents);
    if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 50 || !Number.isInteger(price) || price < 0 || price > 99_999) return { error: "Revisa el producto libre: nombre, cantidad y precio" };
    const note = [c?.free === true ? "Invita la casa" : "", cleanText(c?.note, 120)].filter(Boolean).join(" · ") || null;
    customLines.push({ productId: CUSTOM_PRODUCT_ID, productName: name, quantity, basePriceCents: price, totalCents: price * quantity, modifiers: [], note, discountCents: 0 });
  }
  if ((!items.length && !customLines.length) || items.length > 60 || items.some(invalidLine)) return { error: "Añade algo a la ronda" };
  const priced = items.length ? await priceOrderItems(tenantId, items, { allowDiscount }) : { linesCreate: [], consumption: [] };
  if ("error" in priced) return { error: priced.error };
  return { lines: [...priced.linesCreate, ...customLines], consumption: priced.consumption };
}
