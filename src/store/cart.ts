import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrderLineModifier } from "@/app/lib/menuOptions";
import { comboChoicesKey, type ComboChoice } from "@/app/lib/combos";

export type CartItem = {
  id: string; // ✅ clave única por línea (producto + opciones)
  productId: string;
  name: string;
  unitPriceCents: number; // precio mostrado por unidad (base + extras); el servidor lo recalcula
  quantity: number;
  optionIds: string[]; // lo que se envía a la API
  modifiers: OrderLineModifier[]; // solo para mostrar (pan, guarnición, extras)
  comboChoices?: ComboChoice[]; // combos: lo elegido en cada paso (se envía a la API)
};

type AddItemInput = Omit<CartItem, "id" | "quantity">;

type CartState = {
  items: CartItem[];
  addItem: (item: AddItemInput) => void;
  inc: (id: string) => void; // ✅ ahora por línea
  dec: (id: string) => void; // ✅ ahora por línea
  remove: (id: string) => void;
  clear: () => void;
  reprice: (nextPrices: Record<string, number>, currentPrices: Record<string, number>, hiddenProductIds?: string[]) => number;
  subtotalCents: () => number;
};

// Key estable por producto + opciones: el mismo mollete con otro pan es otra línea.
const makeLineId = (productId: string, optionIds: string[], comboChoices?: ComboChoice[]) =>
  `${productId}::${[...optionIds].sort().join(",")}${comboChoices?.length ? `::${comboChoicesKey(comboChoices)}` : ""}`;

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          const id = makeLineId(item.productId, item.optionIds, item.comboChoices);

          const existingIndex = state.items.findIndex((i) => i.id === id);

          if (existingIndex >= 0) {
            const updated = [...state.items];
            updated[existingIndex] = {
              ...updated[existingIndex],
              quantity: updated[existingIndex].quantity + 1,
            };
            return { items: updated };
          }

          return {
            items: [
              ...state.items,
              {
                id,
                productId: item.productId,
                name: item.name,
                unitPriceCents: item.unitPriceCents,
                optionIds: item.optionIds,
                modifiers: item.modifiers,
                ...(item.comboChoices && { comboChoices: item.comboChoices }),
                quantity: 1,
              },
            ],
          };
        }),

      inc: (id) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        })),

      dec: (id) =>
        set((state) => ({
          items: state.items
            .map((i) => (i.id === id ? { ...i, quantity: i.quantity - 1 } : i))
            .filter((i) => i.quantity > 0),
        })),

      remove: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      clear: () => set({ items: [] }),

      // Cambia solo el precio base; conserva los suplementos de opciones y combos.
      // Devuelve cuántas líneas se quitaron porque no se ofrecen en el nuevo canal.
      reprice: (nextPrices, currentPrices, hiddenProductIds = []) => {
        const hidden = new Set(hiddenProductIds);
        const current = get().items;
        const removed = current.filter((item) => hidden.has(item.productId)).length;
        set({ items: current.filter((item) => !hidden.has(item.productId)).map((item) => {
          const before = currentPrices[item.productId];
          const after = nextPrices[item.productId];
          if (!Number.isInteger(before) || !Number.isInteger(after)) return item;
          return { ...item, unitPriceCents: Math.max(0, item.unitPriceCents + after - before) };
        }) });
        return removed;
      },

      subtotalCents: () =>
        get().items.reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0),
    }),
    // v2: las líneas llevan optionIds. Cambiar el nombre descarta carritos v1
    // guardados en el navegador (no tienen pan elegido y la API los rechazaría).
    { name: "order-saas-cart-v2" }
  )
);
