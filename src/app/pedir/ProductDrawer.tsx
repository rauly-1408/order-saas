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

  // ✅ Cerrar con ESC
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // ✅ Bloquear scroll cuando está abierto
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
      {/* Overlay */}
      <button
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-label="Cerrar"
      />

      {/* Drawer */}
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

        {/* PAN */}
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">
            PAN <span className="text-red-600">*</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {breads.map((b) => (
              <button
                key={b}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  bread === b
                    ? "border-black bg-zinc-50"
                    : "border-zinc-200"
                }`}
                onClick={() => setBread(b)}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* GUARNICIÓN */}
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold">
            GUARNICIÓN <span className="text-red-600">*</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {sides.map((s) => (
              <button
                key={s.name}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                  side === s.name
                    ? "border-black bg-zinc-50"
                    : "border-zinc-200"
                }`}
                onClick={() => {
                  setSide(s.name);
                  setSidePriceCents(s.priceCents);
                }}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-zinc-600">
                  {s.priceCents > 0
                    ? `+ ${euros(s.priceCents)}`
                    : "Incluido"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-5 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-600">Total</div>
            <div className="text-lg font-bold">{euros(total)}</div>
          </div>

          <button
            className={`rounded-lg px-4 py-3 text-sm font-semibold text-white ${
              canAdd ? "bg-black hover:opacity-90" : "bg-black/40"
            }`}
            disabled={!canAdd}
            onClick={() => {
              onAdd({
                productId: product.id,
                name: product.name,
                basePriceCents: product.basePriceCents,
                bread,
                side,
                sidePriceCents,
              });
              onClose();
            }}
          >
            Añadir al carrito
          </button>
        </div>

        <div className="mt-3 text-xs text-zinc-500">
          * Campos obligatorios
        </div>
      </div>
    </div>
  );
}

