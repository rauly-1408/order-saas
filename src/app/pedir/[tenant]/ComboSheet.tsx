"use client";

import { useEffect, useMemo, useState } from "react";
import { initialSelection, type MenuModifierGroup, type OrderLineModifier } from "@/app/lib/menuOptions";
import { priceCombo, type ChoiceProduct, type ComboChoice, type ComboSlotDef } from "@/app/lib/combos";

// Hoja para montar un combo/menú: en cada paso el cliente elige un producto
// (con su pan, guarnición o extras). El precio es el del menú + suplementos.
// Usa las CSS vars del theme del tenant, como ProductOptionsSheet.

export type ComboProduct = { id: string; name: string; description: string; basePriceCents: number; comboSlots: ComboSlotDef[] };

type Props = {
  combo: ComboProduct;
  catalog: Map<string, ChoiceProduct>; // productos disponibles en la carta
  onClose: () => void;
  onAdd: (line: { comboChoices: ComboChoice[]; modifiers: OrderLineModifier[]; unitPriceCents: number }) => void;
};

const euros = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function ComboSheet({ combo, catalog, onClose, onAdd }: Props) {
  // Solo se ofrecen los productos que hoy están disponibles en la carta.
  const slots = useMemo(
    () => combo.comboSlots.map((s) => ({ ...s, items: s.items.filter((i) => catalog.has(i.productId)) })),
    [combo.comboSlots, catalog]
  );
  const [picked, setPicked] = useState<Record<string, string>>({}); // slotId → productId
  const [options, setOptions] = useState<Record<string, Record<string, string[]>>>({}); // slotId → selección del producto
  const [error, setError] = useState("");
  // Paso abierto para cambiar la elección (si no, el elegido se muestra plegado).
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const choices: ComboChoice[] = slots
    .filter((s) => picked[s.id])
    .map((s) => ({ slotId: s.id, productId: picked[s.id], optionIds: Object.values(options[s.id] ?? {}).flat() }));
  const priced = priceCombo({ name: combo.name, basePriceCents: combo.basePriceCents, slots }, choices, catalog);
  const complete = choices.length === slots.length;
  const unitPriceCents = typeof priced === "string" ? combo.basePriceCents + choices.reduce((a, c) => a + (slots.find((s) => s.id === c.slotId)?.items.find((i) => i.productId === c.productId)?.extraCents ?? 0), 0) : priced.unitCents;

  function pick(slotId: string, productId: string) {
    setError("");
    setPicked((p) => ({ ...p, [slotId]: productId }));
    setOptions((o) => ({ ...o, [slotId]: initialSelection(catalog.get(productId)?.modifierGroups ?? []) }));
    setEditing(null);
  }

  function toggle(slotId: string, group: MenuModifierGroup, optionId: string) {
    setError("");
    setOptions((prev) => {
      const sel = { ...(prev[slotId] ?? {}) };
      const current = sel[group.id] ?? [];
      if (group.maxSelect === 1) sel[group.id] = group.isRequired || !current.includes(optionId) ? [optionId] : [];
      else if (current.includes(optionId)) sel[group.id] = current.filter((id) => id !== optionId);
      else if (current.length < group.maxSelect) sel[group.id] = [...current, optionId];
      return { ...prev, [slotId]: sel };
    });
  }

  function handleAdd() {
    const missing = slots.find((s) => !picked[s.id]);
    if (missing) return setError(`${missing.name}: elige una opción`);
    if (typeof priced === "string") return setError(priced);
    onAdd({ comboChoices: choices, modifiers: priced.modifiers, unitPriceCents: priced.unitCents });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={combo.name}>
      <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden p-rise rounded-t-[28px] bg-[var(--surface-0)] text-[var(--text-primary)] shadow-2xl sm:rounded-[28px]">
        <header className="flex items-start gap-3 border-b border-[var(--border)] p-5">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-secondary)]">Menú · {euros(combo.basePriceCents)}</p>
            <h2 className="text-lg font-bold">{combo.name}</h2>
            {combo.description && <p className="mt-1 text-[13px] leading-snug text-[var(--text-secondary)]">{combo.description}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 shrink-0 rounded-full text-xl leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-1)]">
            ×
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {slots.map((slot, n) => {
            const chosenId = picked[slot.id];
            const chosen = chosenId ? catalog.get(chosenId) : null;
            return (
              <section key={slot.id}>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-[15px] font-bold">
                    <span className="mr-1.5 text-[var(--text-secondary)]">{n + 1}.</span>
                    {slot.name}
                  </h3>
                  {chosen && editing !== slot.id ? (
                    <button onClick={() => setEditing(slot.id)} className="text-xs font-semibold text-[var(--brand-accent)]">
                      Cambiar
                    </button>
                  ) : (
                    <span className="text-xs text-[var(--text-secondary)]">Elige uno</span>
                  )}
                </div>
                {slot.items.length === 0 ? (
                  <p className="text-[13px] text-[var(--text-secondary)]">Ahora mismo no hay opciones disponibles.</p>
                ) : (
                  <div className="space-y-2">
                    {slot.items.filter((item) => !chosen || editing === slot.id || item.productId === chosenId).map((item) => {
                      const p = catalog.get(item.productId)!;
                      const selected = chosenId === item.productId;
                      return (
                        <button
                          key={item.productId}
                          onClick={() => pick(slot.id, item.productId)}
                          aria-pressed={selected}
                          className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left ${selected ? "border-[var(--brand-accent)] bg-[var(--surface-1)]" : "border-[var(--border)]"}`}
                        >
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-[var(--brand-accent)]" : "border-[var(--text-secondary)]"}`}>
                            {selected && <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand-accent)]" />}
                          </span>
                          <span className="min-w-0 flex-1 text-[14px]">{p.name}</span>
                          <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">{item.extraCents > 0 ? `+${euros(item.extraCents)}` : "Incluido"}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Pan, guarnición y extras del producto elegido */}
                {chosen && chosen.modifierGroups.length > 0 && (
                  <div className="mt-3 space-y-3 rounded-2xl bg-[var(--surface-1)] p-3">
                    {chosen.modifierGroups.map((g) => (
                      <div key={g.id}>
                        <p className="mb-1.5 text-[13px] font-semibold">
                          {g.name} <span className="font-normal text-[var(--text-secondary)]">· {g.isRequired ? "obligatorio" : "opcional"}</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {g.options.map((o) => {
                            const on = (options[slot.id]?.[g.id] ?? []).includes(o.id);
                            return (
                              <button
                                key={o.id}
                                onClick={() => toggle(slot.id, g, o.id)}
                                aria-pressed={on}
                                className={`p-press rounded-full border px-3 py-1.5 text-[13px] ${on ? "border-[var(--brand-accent)] bg-[var(--brand-accent)] font-semibold text-[var(--on-accent)]" : "border-[var(--border)]"}`}
                              >
                                {on && "✓ "}
                                {o.name}
                                {o.priceDeltaCents > 0 && <span className="opacity-70"> +{euros(o.priceDeltaCents)}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <footer className="border-t border-[var(--border)] p-4">
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          <button
            onClick={handleAdd}
            className={`p-press w-full rounded-full bg-[var(--brand-accent)] py-3.5 text-[15px] font-semibold text-[var(--on-accent)] ${complete ? "" : "opacity-60"}`}
          >
            {complete ? `Añadir menú · ${euros(unitPriceCents)}` : `Elige ${slots.length - choices.length === 1 ? "1 opción más" : `${slots.length - choices.length} opciones más`} · ${euros(unitPriceCents)}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
