"use client";

import { useMemo, useState } from "react";
import { useCart } from "@/store/cart";
import ProductDrawer from "./ProductDrawer";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
};

type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isFeatured: boolean;
  products: MenuProduct[];
};

type MenuClientProps = {
  tenantName: string;
  categories: MenuCategory[];
};

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100
  );

export default function MenuClient({ tenantName, categories }: MenuClientProps) {
  const { items, addItem, inc, dec, subtotalCents, clear } = useCart();

  // ✅ Drawer state
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MenuProduct | null>(null);

  const count = useMemo(
    () => items.reduce((acc, i) => acc + i.quantity, 0),
    [items]
  );

  const subtotal = subtotalCents();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{tenantName} · Pedir</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Delivery y recogida. Precios en EUR.
        </p>
      </header>

      {/* Categories */}
      <div className="space-y-8">
        {categories.map((cat) => (
          <section key={cat.id} id={cat.slug}>
            <h2 className="mb-3 text-lg font-semibold">{cat.name}</h2>

            <div className="space-y-3">
              {cat.products.map((p) => (
                <article
                  key={p.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold">{p.name}</div>
                      {p.description ? (
                        <div className="mt-1 text-sm text-zinc-600">
                          {p.description}
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{euros(p.basePriceCents)}</div>

                      {/* ✅ Ahora abre el drawer */}
                      <button
                        className="mt-2 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                        onClick={() => {
                          setSelected(p);
                          setOpen(true);
                        }}
                      >
                        Añadir
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Sticky Cart Bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm text-zinc-600">Carrito</div>
            <div className="truncate font-semibold">
              {count} {count === 1 ? "artículo" : "artículos"} · {euros(subtotal)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 ? (
              <>
                <button
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                  onClick={clear}
                >
                  Vaciar
                </button>

                <button
                  className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  onClick={() => {
                    alert("Siguiente: pantalla carrito / checkout");
                  }}
                >
                  Ver carrito
                </button>
              </>
            ) : (
              <button
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white opacity-40"
                disabled
              >
                Ver carrito
              </button>
            )}
          </div>
        </div>

        {/* Mini lista (opcional) */}
        {items.length > 0 ? (
          <div className="mx-auto max-w-3xl px-4 pb-3">
            <div className="mt-2 space-y-2">
              {items.slice(0, 3).map((i) => (
                <div
                  key={i.productId}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-zinc-600">
                      {euros(i.basePriceCents)} · x{i.quantity}
                    </div>
                    {i.modifiers?.bread || i.modifiers?.side ? (
                      <div className="mt-1 text-[11px] text-zinc-500">
                        {i.modifiers?.bread ? `PAN: ${i.modifiers.bread}` : ""}
                        {i.modifiers?.bread && i.modifiers?.side ? " · " : ""}
                        {i.modifiers?.side ? `GUARNICIÓN: ${i.modifiers.side}` : ""}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="h-8 w-8 rounded-md border border-zinc-300 text-sm font-semibold hover:bg-white"
                      onClick={() => dec(i.productId)}
                    >
                      −
                    </button>
                    <button
                      className="h-8 w-8 rounded-md border border-zinc-300 text-sm font-semibold hover:bg-white"
                      onClick={() => inc(i.productId)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
              {items.length > 3 ? (
                <div className="text-xs text-zinc-600">
                  +{items.length - 3} más…
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* ✅ Drawer de producto */}
      <ProductDrawer
        open={open}
        product={selected}
        onClose={() => setOpen(false)}
        onAdd={({ productId, name, basePriceCents, bread, side, sidePriceCents }) =>
          addItem({
            productId,
            name,
            // total de línea base (producto + extra de guarnición)
            basePriceCents: basePriceCents + sidePriceCents,
            modifiers: { bread, side, sidePriceCents },
          })
        }
      />
    </div>
  );
}
