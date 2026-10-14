import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OrderLineModifier } from "@/app/lib/menuOptions";

export type CartItem = {
  id: string; // ✅ clave única por línea (producto + opciones)
  productId: string;
  name: string;
  unitPriceCents: number; // precio mostrado por unidad (base + extras); el servidor lo recalcula
  quantity: number;
  optionIds: string[]; // lo que se envía a la API
  modifiers: OrderLineModifier[]; // solo para mostrar (pan, guarnición, extras)
};

type AddItemInput = Omit<CartItem, "id" | "quantity">;

type CartState = {
  items: CartItem[];
  addItem: (item: AddItemInput) => void;
  inc: (id: string) => void; // ✅ ahora por línea
  dec: (id: string) => void; // ✅ ahora por línea
  remove: (id: string) => void;
  clear: () => void;
  subtotalCents: () => number;
};

// Key estable por producto + opciones: el mismo mollete con otro pan es otra línea.
const makeLineId = (productId: string, optionIds: string[]) =>
  `${productId}::${[...optionIds].sort().join(",")}`;

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          const id = makeLineId(item.productId, item.optionIds);

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

      subtotalCents: () =>
        get().items.reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0),
    }),
    // v2: las líneas llevan optionIds. Cambiar el nombre descarta carritos v1
    // guardados en el navegador (no tienen pan elegido y la API los rechazaría).
    { name: "order-saas-cart-v2" }
  )
);
