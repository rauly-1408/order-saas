"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  onAdd: (payload: {
    productId: string;
    name: string;
    basePriceCents: number;
    bread: string;
    side: string;
    sidePriceCents: number;
  }) => void;
};

const breads = [
  "Tradicional",
  "Queso cheddar",
  "Mantequilla",
  "Lechuga de mar y aceitunas",
  "Cúrcuma y jengibre",
  "Tomate y pesto picante",
  "Alga nori y sésamo",
  "Tomate y pesto",
];

const sides = [
  { name: "Patatas fritas (incluido)", priceCents: 0 },
  { name: "Boniato", priceCents: 120 },
];

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format((cents ?? 0) / 100);

export default function ProductDrawer({ open, onClose, product, onAdd }: Props) {
  const [bread, setBread] = useState<string>("");
  const [side, setSide] = useState<string>("");
  const [sidePriceCents, setSidePriceCents] = useState<number>(0);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const canAdd = Boolean(product && bread && side);

  const total = useMemo(() => {
    if (!product) return 0;
    return product.basePriceCents + sidePriceCents;
  }, [product, sidePriceCents]);

  if (!open || !product) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Cerrar"
      />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-bold">{product.name}</div>
            {product.description && (
              <div className="mt-1 text-sm text-zinc-600">
                {product.description}
              </div>
            )}
          </div>
          <button
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-semibold"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">
            PAN <span className="text-red-600">*</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {breads.map((b) => (
              <button
                key={b}
                onClick={() => setBread(b)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  bread === b
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">
            ACOMPAÑAMIENTO <span className="text-red-600">*</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sides.map((s) => (
              <button
                key={s.name}
                onClick={() => {
                  setSide(s.name);
                  setSidePriceCents(s.priceCents);
                }}
                className={`rounded-full border px-3 py-1 text-sm ${
                  side === s.name
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {s.name}{s.priceCents > 0 ? ` (+${euros(s.priceCents)})` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div className="text-base font-semibold">{euros(total)}</div>
          <button
            disabled={!canAdd}
            onClick={() => {
              if (!product || !bread || !side) return;
              onAdd({
                productId: product.id,
                name: product.name,
                basePriceCents: product.basePriceCents,
                bread,
                side,
                sidePriceCents,
              });
              setBread("");
              setSide("");
              setSidePriceCents(0);
            }}
            className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Añadir al carrito
          </button>
        </div>
      </div>
    </div>
  );
}
