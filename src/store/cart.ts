import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartModifiers = {
  bread?: string;
  side?: string;
  sidePriceCents?: number;
};

export type CartItem = {
  id: string; // ✅ clave única por línea (producto + modificadores)
  productId: string;
  name: string;
  unitPriceCents: number; // ✅ precio FINAL por unidad (base + extras)
  quantity: number;
  modifiers?: CartModifiers;
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

// ✅ helper: crea una key estable por producto + modificadores
const makeLineId = (productId: string, modifiers?: CartModifiers) => {
  const bread = modifiers?.bread ?? "";
  const side = modifiers?.side ?? "";
  const sidePrice = modifiers?.sidePriceCents ?? 0;
  return `${productId}::${bread}::${side}::${sidePrice}`;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) =>
        set((state) => {
          const id = makeLineId(item.productId, item.modifiers);

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
    { name: "order-saas-cart-v1" }
  )
);
