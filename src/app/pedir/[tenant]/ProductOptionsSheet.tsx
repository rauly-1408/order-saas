"use client";

import { useEffect, useMemo, useState } from "react";
import { useSheetDrag } from "./useSheetDrag";
import {
  initialSelection,
  selectionToModifiers,
  validateSelection,
  type MenuModifierGroup,
  type OrderLineModifier,
} from "@/app/lib/menuOptions";
import { optionError, ui, type Lang } from "@/app/lib/i18n";

// Hoja inferior para elegir pan, guarnición y extras antes de añadir al carrito.
// Usa las CSS vars del theme del tenant (definidas en el contenedor de MenuClient).

export type SheetProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  modifierGroups: MenuModifierGroup[];
  allergens?: string[];
  imageUrl?: string | null;
};

type Props = {
  product: SheetProduct;
  onClose: () => void;
  onAdd: (line: { optionIds: string[]; modifiers: OrderLineModifier[]; unitPriceCents: number; note?: string; quantity: number }) => void;
  lang?: Lang;
  // Panel (Mesas y Caja): nota para cocina al pedir, con atajos de un toque.
  withNote?: boolean;
  // Tienda online: elegir cuántas unidades se añaden de una vez.
  withQty?: boolean;
};

export const NOTE_CHIPS = ["Sin cebolla", "Sin salsa", "Sin gluten", "Poco hecha", "Al punto", "Muy hecha", "Salsa aparte", "Para compartir"];

const euros = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function ProductOptionsSheet({ product, onClose, onAdd, lang = "es", withNote = false, withQty = false }: Props) {
  const { setPanel, setBackdrop, onPointerDown: dragDown, onPointerMove: dragMove, onPointerUp: dragUp, onPointerCancel: dragCancel } = useSheetDrag(onClose);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState(1);
  // Foto grande solo en la tienda online; en Caja y Mesas el personal va rápido.
  const photo = withQty ? product.imageUrl : null;
  const T = ui(lang);
  const groups = product.modifierGroups;
  const [selection, setSelection] = useState<Record<string, string[]>>(() => initialSelection(groups));
  const [error, setError] = useState("");
  // Grupos plegables (extras opcionales) que el cliente ha desplegado.
  const [open, setOpen] = useState<Record<string, boolean>>({});

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
      setError(optionError(err, lang));
      return;
    }
    onAdd({ optionIds: Object.values(selection).flat(), modifiers, unitPriceCents, quantity: withQty ? qty : 1, ...(withNote && note.trim() && { note: note.trim().slice(0, 120) }) });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={product.name}>
      <button ref={setBackdrop} aria-label={T.close} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />

      <div ref={setPanel} className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden p-rise rounded-t-[28px] bg-[var(--surface-0)] text-[var(--text-primary)] shadow-2xl will-change-transform sm:rounded-[28px]">
        {/* Foto grande arriba (tienda): se ve entera, con la misma foto desenfocada de fondo.
            También es el asa para cerrar la hoja deslizando hacia abajo (móvil). */}
        {photo && (
          <div onPointerDown={dragDown} onPointerMove={dragMove} onPointerUp={dragUp} onPointerCancel={dragCancel} className="relative h-[min(36vh,100vw)] shrink-0 touch-none overflow-hidden bg-black sm:h-72 sm:touch-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={product.name} className="relative h-full w-full object-contain" />
            <span aria-hidden className="absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/70 sm:hidden" />
          </div>
        )}
        {photo && (
          <button onClick={onClose} aria-label={T.close} className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-[20px] leading-none text-black shadow-md backdrop-blur hover:bg-white">
            ×
          </button>
        )}

        {/* Nombre, descripción y opciones se desplazan juntos: en móviles pequeños queda sitio para elegir */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {/* Se agarra por aquí para cerrarla deslizando hacia abajo (móvil) */}
        <header
          onPointerDown={photo ? undefined : dragDown}
          onPointerMove={photo ? undefined : dragMove}
          onPointerUp={photo ? undefined : dragUp}
          onPointerCancel={photo ? undefined : dragCancel}
          className={`relative flex items-start gap-3 border-b border-[var(--border)] p-5 ${photo ? "pt-4" : "touch-none pt-7 sm:touch-auto sm:pt-5"}`}
        >
          {!photo && <span aria-hidden className="absolute left-1/2 top-2.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-[var(--text-secondary)] opacity-30 sm:hidden" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold leading-tight tracking-[-0.01em] [text-wrap:balance]">{product.name}</h2>
            <p className="mt-1 text-[17px] font-bold tabular-nums text-[var(--brand-secondary)]">{euros(product.basePriceCents)}</p>
            {product.description && (
              <p className="mt-2 text-[14px] leading-relaxed text-[var(--text-secondary)] [text-wrap:pretty]">{product.description}</p>
            )}
            {product.allergens && product.allergens.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5" aria-label={`${T.allergens}: ${product.allergens.join(", ")}`}>
                {product.allergens.map((a) => (
                  <span key={a} className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                    {a}
                  </span>
                ))}
              </p>
            )}
          </div>
          {!photo && (
            <button
              onClick={onClose}
              aria-label={T.close}
              className="h-9 w-9 shrink-0 rounded-full text-xl leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-1)]"
            >
              ×
            </button>
          )}
        </header>
        <div className={groups.length ? "space-y-6 p-5" : "hidden"}>
          {groups.map((group) => {
            const chosen = selection[group.id] ?? [];
            const multi = group.maxSelect > 1;
            const single = group.maxSelect === 1 && group.isRequired;
            // Grupos opcionales ("Añade ingredientes", "Añade salsas"): plegados por
            // defecto para que el pan y la guarnición sean lo primero que se ve.
            // El título es el nombre del grupo, editable por cada restaurante.
            if (!group.isRequired) {
              const isOpen = !!open[group.id];
              const chosenOptions = group.options.filter((o) => chosen.includes(o.id));
              const extraCents = chosenOptions.reduce((acc, o) => acc + o.priceDeltaCents, 0);
              const prices = [...new Set(group.options.map((o) => o.priceDeltaCents))];
              const uniformPrice = prices.length === 1 && prices[0] > 0 ? prices[0] : null;
              const priceHint = uniformPrice != null && group.options.length > 1 ? T.each(euros(uniformPrice)) : "";
              // Con 1-2 opciones se nombran ("Doble burguer estilo smash · +3,95 €"); con más, se cuentan.
              const available =
                group.options.length <= 2
                  ? group.options.map((o) => (o.priceDeltaCents > 0 ? `${o.name} · +${euros(o.priceDeltaCents)}` : o.name)).join(" / ")
                  : `${T.nOptions(group.options.length)}${priceHint}`;
              return (
                <section key={group.id} className="overflow-hidden rounded-2xl bg-[var(--surface-1)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                  <button
                    type="button"
                    onClick={() => setOpen((prev) => ({ ...prev, [group.id]: !isOpen }))}
                    aria-expanded={isOpen}
                    aria-controls={`extras-${group.id}`}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-accent)] text-[var(--on-accent)]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[15px] font-bold">{group.name}</span>
                        {chosen.length > 0 && (
                          <span className="rounded-full bg-[var(--brand-secondary)] px-2 py-0.5 text-[11px] font-bold text-[var(--on-secondary)]">{chosen.length}</span>
                        )}
                      </span>
                      <span className="block truncate text-[12px] text-[var(--text-secondary)]">
                        {chosenOptions.length
                          ? `${chosenOptions.map((o) => o.name).join(", ")} · +${euros(extraCents)}`
                          : available}
                      </span>
                    </span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className={`shrink-0 text-[var(--text-secondary)] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {/* Despliegue animado: la fila de la rejilla pasa de 0fr a 1fr */}
                  <div
                    id={`extras-${group.id}`}
                    className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="flex flex-wrap gap-2 px-4 pt-1 pb-4" inert={!isOpen}>
                        {group.options.map((option) => {
                          const selected = chosen.includes(option.id);
                          return (
                            <button
                              key={option.id}
                              onClick={() => toggle(group, option.id)}
                              aria-pressed={selected}
                              className={`p-press rounded-full border px-3 py-1.5 text-[13px] ${
                                selected
                                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] font-semibold text-[var(--on-accent)]"
                                  : "border-[var(--border)] text-[var(--text-primary)]"
                              }`}
                            >
                              {selected && "✓ "}
                              {option.name}
                              {option.priceDeltaCents > 0 && !priceHint && <span className="opacity-70"> +{euros(option.priceDeltaCents)}</span>}
                              {option.allergens && option.allergens.length > 0 && <span className="opacity-70"> · {option.allergens.join(", ")}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>
              );
            }
            return (
              <section key={group.id}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-bold">{group.name}</h3>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {group.isRequired ? T.required : multi ? T.optionalMulti : T.optional}
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
                              ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] font-semibold text-[var(--on-accent)]"
                              : "border-[var(--border)] text-[var(--text-primary)]"
                          }`}
                        >
                          {option.name}
                          {option.priceDeltaCents > 0 && <span className="opacity-70"> +{euros(option.priceDeltaCents)}</span>}
                          {option.allergens && option.allergens.length > 0 && <span className="opacity-70"> · {option.allergens.join(", ")}</span>}
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
                            <span className="ml-2 rounded-md bg-[var(--brand-secondary)]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[var(--brand-secondary)]">
                              {T.recommended}
                            </span>
                          )}
                          {option.allergens && option.allergens.length > 0 && (
                            <span className="block text-[11px] text-[var(--text-secondary)]">{T.allergens}: {option.allergens.join(", ")}</span>
                          )}
                        </span>
                        <span className="text-[13px] text-[var(--text-secondary)]">
                          {option.priceDeltaCents > 0 ? `+${euros(option.priceDeltaCents)}` : group.code === "SIDE" ? T.included : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        </div>

        <footer className="border-t border-[var(--border)] p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {withNote && <NoteField note={note} setNote={setNote} />}
          {error && <p className="mb-2 text-sm text-red-600" role="alert">{error}</p>}
          <div className="flex items-center gap-3">
            {withQty && (
              <div className="flex shrink-0 items-center rounded-full border border-[var(--border)]" role="group" aria-label={T.quantity}>
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={T.removeOne(product.name)} className="p-press flex h-12 w-11 items-center justify-center rounded-full text-xl font-bold disabled:opacity-30">
                  −
                </button>
                <span className="w-6 text-center text-[16px] font-bold tabular-nums" aria-live="polite">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label={T.addAnother(product.name)} className="p-press flex h-12 w-11 items-center justify-center rounded-full text-xl font-bold">
                  +
                </button>
              </div>
            )}
            <button
              onClick={handleAdd}
              className="p-press min-h-12 flex-1 rounded-full bg-[var(--brand-accent)] px-4 py-3.5 text-[15px] font-semibold text-[var(--on-accent)]"
            >
              {withQty ? T.addShort(euros(unitPriceCents * qty)) : T.addToOrder(euros(unitPriceCents))}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// Nota para cocina (solo en el panel): atajos de un toque y texto libre.
export function NoteField({ note, setNote }: { note: string; setNote: (fn: (n: string) => string) => void }) {
  return (
    <div className="mb-3">
              <label className="text-[13px] font-semibold" htmlFor="opt-note">
                Nota para cocina
              </label>
              <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                {NOTE_CHIPS.map((c) => {
                  const on = note.toLowerCase().includes(c.toLowerCase());
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setNote((n) => (on ? n.replace(new RegExp(`(,\\s*)?${c}`, "i"), "").replace(/^,\s*/, "") : n.trim() ? `${n.trim()}, ${c}` : c))}
                      className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium ${on ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] text-[var(--on-accent)]" : "border-[var(--border)]"}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <input id="opt-note" value={note} onChange={(e) => setNote(() => e.target.value.slice(0, 120))} placeholder="Escribe lo que pida el cliente (sin tomate, extra de queso…)" className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-1)] px-4 py-3 text-[15px] outline-none focus:border-[var(--brand-accent)]" />
            </div>
  );
}
