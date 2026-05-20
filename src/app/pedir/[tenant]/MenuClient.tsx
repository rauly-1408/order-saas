"use client";

import Link from "next/link";
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
  tenant: string;
  tenantName: string;
  categories: MenuCategory[];
};

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100
  );

export default function MenuClient({ tenant, tenantName, categories }: MenuClientProps) {
  const { items, addItem, subtotalCents, clear } = useCart();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MenuProduct | null>(null);

  const count = useMemo(
    () => items.reduce((acc, it) => acc + it.quantity, 0),
    [items]
  );

  const subtotal = subtotalCents();

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{tenantName}</h1>
        <p className="mt-1 text-sm text-zinc-500">Delivery y recogida</p>
      </header>

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
                        <div className="mt-1 text-sm text-zinc-600">{p.description}</div>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{euros(p.basePriceCents)}</div>
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

      {/* Cart bar */}
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
                <Link
                  href={`/pedir/${tenant}/checkout`}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
                >
                  Ver pedido →
                </Link>
              </>
            ) : (
              <span className="text-sm text-zinc-400">Vacío</span>
            )}
          </div>
        </div>
      </div>

      <ProductDrawer
        open={open}
        onClose={() => setOpen(false)}
        product={selected}
        onAdd={(payload) => {
          addItem({
            productId: payload.productId,
            name: payload.name,
            unitPriceCents: payload.basePriceCents + payload.sidePriceCents,
            modifiers: {
              bread: payload.bread,
              side: payload.side,
              sidePriceCents: payload.sidePriceCents,
            },
          });
          setOpen(false);
        }}
      />
    </div>
  );
}
