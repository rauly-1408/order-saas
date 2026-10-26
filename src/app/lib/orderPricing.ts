import { Prisma } from "@prisma/client";
import { cleanText } from "@/app/lib/text";
import { prisma } from "@/app/lib/prisma";
import { priceCombo, type ChoiceProduct, type ComboChoice } from "@/app/lib/combos";
import { selectionToModifiers, validateSelection, type MenuModifierGroup } from "@/app/lib/menuOptions";
import type { CartLine } from "@/app/lib/promotions";
import type { ConsumptionItem } from "@/app/lib/inventory";

// Precio de las líneas de un pedido a partir de la base de datos (nunca del
// navegador): productos disponibles, opciones válidas y menús con sus pasos.
// Lo usan la tienda (POST /api/orders) y la Caja del panel. Ver docs/CAJA.md

// El cliente solo indica QUÉ pide; nombre y precios se toman de la base de datos.
export type OrderLineInput = {
  productId: string;
  quantity: number;
  optionIds?: string[];
  comboChoices?: ComboChoice[]; // solo para combos: lo elegido en cada hueco
  note?: string; // nota de la línea para cocina («sin cebolla»)
  discountCents?: number; // descuento manual de la línea: solo la Caja (allowDiscount)
  takeaway?: boolean; // mesa: esta línea es para llevar (sale «PARA LLEVAR» en la comanda y gasta packaging)
};

export const MAX_LINE_NOTE = 120;

// Nota de la línea (cualquier canal) y descuento manual (solo si allowDiscount,
// es decir, personal del restaurante en la Caja); nunca deja la línea en negativo.
function withLineExtras(line: Prisma.OrderLineCreateWithoutOrderInput, item: OrderLineInput, opts: { allowDiscount?: boolean }): Prisma.OrderLineCreateWithoutOrderInput {
  const note = [item.takeaway === true ? "PARA LLEVAR" : "", cleanText(item.note, MAX_LINE_NOTE)].filter(Boolean).join(" · ") || null;
  const total = line.totalCents ?? 0;
  const discountCents = opts.allowDiscount && Number.isInteger(item.discountCents) ? Math.min(Math.max(item.discountCents as number, 0), total) : 0;
  return { ...line, note, discountCents, totalCents: total - discountCents };
}

export const MAX_QTY_PER_LINE = 50;

export type PricedItems = {
  linesCreate: Prisma.OrderLineCreateWithoutOrderInput[];
  cartLines: CartLine[];
  consumption: ConsumptionItem[];
  subtotalCents: number;
};

// Valida la forma de cada línea (cantidad, opciones, pasos de menú).
export function invalidLine(item: unknown): boolean {
  const i = (item ?? {}) as Record<string, unknown>;
  const optionIds = i.optionIds as unknown;
  const comboChoices = i.comboChoices as unknown;
  const badIds = (arr: unknown) => !Array.isArray(arr) || arr.some((id) => typeof id !== "string");
  return (
    (i.note !== undefined && typeof i.note !== "string") ||
    (i.takeaway !== undefined && typeof i.takeaway !== "boolean") ||
    (i.discountCents !== undefined && (!Number.isInteger(i.discountCents) || (i.discountCents as number) < 0)) ||
    typeof i.productId !== "string" ||
    !Number.isInteger(i.quantity) ||
    (i.quantity as number) < 1 ||
    (i.quantity as number) > MAX_QTY_PER_LINE ||
    (optionIds !== undefined && badIds(optionIds)) ||
    (comboChoices !== undefined &&
      (!Array.isArray(comboChoices) ||
        comboChoices.length > 10 ||
        comboChoices.some((c) => {
          const x = (c ?? {}) as Record<string, unknown>;
          return !c || typeof x.slotId !== "string" || typeof x.productId !== "string" || (x.optionIds !== undefined && badIds(x.optionIds));
        })))
  );
}

export async function priceOrderItems(tenantId: string, items: OrderLineInput[], opts: { allowDiscount?: boolean } = {}): Promise<PricedItems | { error: string }> {
  const productIds = [...new Set(items.map((i) => i.productId))];
  const groupsSelect = {
    orderBy: { sortOrder: "asc" as const },
    select: {
      defaultOptionId: true,
      group: {
        select: {
          id: true,
          code: true,
          name: true,
          isRequired: true,
          minSelect: true,
          maxSelect: true,
          options: {
            where: { isAvailable: true, stockOut: false },
            orderBy: { sortOrder: "asc" as const },
            select: { id: true, name: true, priceDeltaCents: true },
          },
        },
      },
    },
  };
  const available = { tenantId: tenantId, isActive: true, isAvailable: true, stockOut: false };
  const products = await prisma.product.findMany({
    where: { ...available, id: { in: productIds } },
    select: {
      id: true,
      name: true,
      basePriceCents: true,
      categoryId: true,
      isCombo: true,
      comboSlots: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, required: true, items: { select: { productId: true, extraCents: true } } } },
      modifierGroups: groupsSelect,
    },
  });

  // Productos elegidos dentro de los combos (tienen que estar disponibles).
  const choiceIds = [...new Set(items.flatMap((i) => (i.comboChoices ?? []).map((c) => c.productId)))];
  const choiceProducts = choiceIds.length
    ? await prisma.product.findMany({ where: { ...available, isCombo: false, id: { in: choiceIds } }, select: { id: true, name: true, modifierGroups: groupsSelect } })
    : [];
  const choiceById = new Map<string, ChoiceProduct>(
    choiceProducts.map((p) => [p.id, { id: p.id, name: p.name, modifierGroups: p.modifierGroups.map((pmg) => ({ ...pmg.group, defaultOptionId: pmg.defaultOptionId })) }])
  );

  if (products.length !== productIds.length) {
    return { error: "Algún producto ya no está disponible. Revisa tu pedido." };
  }
  const productById = new Map(products.map((p) => [p.id, p]));

  // Precio de cada línea = precio base + suplementos de las opciones elegidas.
  const linesCreate: Prisma.OrderLineCreateWithoutOrderInput[] = [];
  const cartLines: CartLine[] = [];
  const consumption: ConsumptionItem[] = [];
  for (const item of items) {
    const product = productById.get(item.productId)!;
    // Combo: precio cerrado + suplementos; el stock sale de lo elegido.
    if (product.isCombo) {
      const choices = (item.comboChoices ?? []).map((c) => ({ ...c, optionIds: c.optionIds ?? [] }));
      const priced = priceCombo({ name: product.name, basePriceCents: product.basePriceCents, slots: product.comboSlots }, choices, choiceById);
      if (typeof priced === "string") return { error: priced };
      cartLines.push({ key: String(cartLines.length), categoryId: product.categoryId, unitBaseCents: product.basePriceCents, quantity: item.quantity });
      for (const c of choices) consumption.push({ productId: c.productId, quantity: item.quantity, optionIds: c.optionIds });
      linesCreate.push(withLineExtras({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        basePriceCents: product.basePriceCents,
        modifiers: priced.modifiers as unknown as Prisma.InputJsonValue,
        totalCents: priced.unitCents * item.quantity,
      }, item, opts));
      continue;
    }
    const groups: MenuModifierGroup[] = product.modifierGroups.map((pmg) => ({
      ...pmg.group,
      defaultOptionId: pmg.defaultOptionId,
    }));

    const selection: Record<string, string[]> = {};
    for (const g of groups) selection[g.id] = [];
    for (const optionId of new Set(item.optionIds ?? [])) {
      const group = groups.find((g) => g.options.some((o) => o.id === optionId));
      if (!group) {
        return { error: `${product.name}: opción no válida` };
      }
      selection[group.id].push(optionId);
    }

    const selectionError = validateSelection(groups, selection);
    if (selectionError) {
      return { error: `${product.name} — ${selectionError}` };
    }

    const modifiers = selectionToModifiers(groups, selection);
    const unitCents = product.basePriceCents + modifiers.reduce((acc, m) => acc + m.priceDeltaCents, 0);
    cartLines.push({ key: String(cartLines.length), categoryId: product.categoryId, unitBaseCents: product.basePriceCents, quantity: item.quantity });
    consumption.push({ productId: product.id, quantity: item.quantity, optionIds: Object.values(selection).flat() });
    linesCreate.push(withLineExtras({
      productId: product.id,
      productName: product.name,
      quantity: item.quantity,
      basePriceCents: product.basePriceCents,
      modifiers: modifiers as unknown as Prisma.InputJsonValue,
      totalCents: unitCents * item.quantity,
    }, item, opts));
  }

  const subtotalCents = linesCreate.reduce((acc, line) => acc + (line.totalCents ?? 0), 0);
  return { linesCreate, cartLines, consumption, subtotalCents };
}
