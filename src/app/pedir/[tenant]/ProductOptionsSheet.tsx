"use client";

import { useEffect, useMemo, useState } from "react";
import {
  initialSelection,
  selectionToModifiers,
  validateSelection,
  type MenuModifierGroup,
  type OrderLineModifier,
} from "@/app/lib/menuOptions";

// Hoja inferior para elegir pan, guarnición y extras antes de añadir al carrito.
// Usa las CSS vars del theme del tenant (definidas en el contenedor de MenuClient).

export type SheetProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  modifierGroups: MenuModifierGroup[];
};

type Props = {
  product: SheetProduct;
  onClose: () => void;
  onAdd: (line: { optionIds: string[]; modifiers: OrderLineModifier[]; unitPriceCents: number }) => void;
};

const euros = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function ProductOptionsSheet({ product, onClose, onAdd }: Props) {
  const groups = product.modifierGroups;
  const [selection, setSelection] = useState<Record<string, string[]>>(() => initialSelection(groups));
  const [error, setError] = useState("");

  const modifiers = useMemo(() => selectionToModifiers(groups, selection), [groups, selection]);
  const unitPriceCents = product.basePriceCents + modifiers.reduce((acc, m) => acc + m.priceDeltaCents, 0);

  // Bloquea el scroll de fondo y cierra con Escape.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function toggle(group: MenuModifierGroup, optionId: string) {
    setError("");
    setSelection((prev) => {
      const current = prev[group.id] ?? [];
      // Elección única obligatoria (pan, guarnición): se comporta como radio.
      if (group.maxSelect === 1 && group.isRequired) return { ...prev, [group.id]: [optionId] };
      if (current.includes(optionId)) return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      if (group.maxSelect === 1) return { ...prev, [group.id]: [optionId] };
      if (current.length >= group.maxSelect) return prev;
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function handleAdd() {
    const err = validateSelection(groups, selection);
    if (err) {
      setError(err);
      return;
    }
    onAdd({ optionIds: Object.values(selection).flat(), modifiers, unitPriceCents });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={product.name}>
      <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/60" />

      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[var(--surface-0)] text-[var(--text-primary)] sm:rounded-2xl">
        <header className="flex items-start gap-3 border-b border-[var(--border)] p-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">{product.name}</h2>
            {product.description && (
              <p className="mt-1 text-[13px] leading-snug text-[var(--text-secondary)]">{product.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="h-8 w-8 shrink-0 rounded-full text-xl leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {groups.map((group) => {
            const chosen = selection[group.id] ?? [];
            const multi = group.maxSelect > 1;
            const single = group.maxSelect === 1 && group.isRequired;
            return (
              <section key={group.id}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-bold">{group.name}</h3>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {group.isRequired ? "Obligatorio" : multi ? "Opcional · elige las que quieras" : "Opcional"}
                  </span>
                </div>
                <div className={multi ? "flex flex-wrap gap-2" : "space-y-2"}>
                  {group.options.map((option) => {
                    const selected = chosen.includes(option.id);
                    const recommended = option.id === group.defaultOptionId;
                    if (multi) {
                      return (
                        <button
                          key={option.id}
                          onClick={() => toggle(group, option.id)}
                          aria-pressed={selected}
                          className={`rounded-full border px-3 py-1.5 text-[13px] ${
                            selected
                              ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] font-semibold text-[#0d0d0d]"
                              : "border-[var(--border)] text-[var(--text-primary)]"
                          }`}
                        >
                          {option.name}
                          {option.priceDeltaCents > 0 && <span className="opacity-70"> +{euros(option.priceDeltaCents)}</span>}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={option.id}
                        onClick={() => toggle(group, option.id)}
                        aria-pressed={selected}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${
                          selected ? "border-[var(--brand-accent)] bg-[var(--surface-1)]" : "border-[var(--border)]"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${single ? "rounded-full" : "rounded-md"} ${
                            selected ? "border-[var(--brand-accent)]" : "border-[var(--text-secondary)]"
                          }`}
                        >
                          {selected && <span className={`h-2.5 w-2.5 bg-[var(--brand-accent)] ${single ? "rounded-full" : "rounded-sm"}`} />}
                        </span>
                        <span className="flex-1 text-[14px]">
                          {option.name}
                          {recommended && (
                            <span className="ml-2 rounded-md bg-[var(--brand-accent)]/15 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand-accent)]">
                              Recomendado
                            </span>
                          )}
                        </span>
                        <span className="text-[13px] text-[var(--text-secondary)]">
                          {option.priceDeltaCents > 0 ? `+${euros(option.priceDeltaCents)}` : group.code === "SIDE" ? "Incluido" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="border-t border-[var(--border)] p-4">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <button
            onClick={handleAdd}
            className="w-full rounded-xl bg-[var(--brand-accent)] py-3.5 text-[15px] font-extrabold text-[#0d0d0d]"
          >
            Añadir al pedido · {euros(unitPriceCents)}
          </button>
        </footer>
      </div>
    </div>
  );
}
