"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ProductOptionsSheet, { type SheetProduct } from "@/app/pedir/[tenant]/ProductOptionsSheet";
import ComboSheet, { type ComboProduct } from "@/app/pedir/[tenant]/ComboSheet";
import { modifierLabels, type MenuModifierGroup, type OrderLineModifier } from "@/app/lib/menuOptions";
import { comboChoicesKey, type ChoiceProduct, type ComboChoice, type ComboSlotDef } from "@/app/lib/combos";
import { STORE_VARS } from "../storeVars";
import { euros, post, usePortal } from "./shared";

// Tomar una ronda: la carta de la Caja (con opciones, menús y notas) y, abajo,
// lo que lleva la ronda. «Enviar a cocina» la añade a la cuenta e imprime su
// comanda. Ver docs/MESAS.md

type Product = { id: string; name: string; description: string; basePriceCents: number; imageUrl?: string | null; modifierGroups: MenuModifierGroup[]; isCombo?: boolean; comboSlots?: ComboSlotDef[] };
type Category = { id: string; slug: string; name: string; products: Product[] };
type Line = { key: string; productId: string; name: string; unitPriceCents: number; quantity: number; optionIds: string[]; comboChoices?: ComboChoice[]; modifiers: OrderLineModifier[]; note?: string };

// La carta se carga una vez por visita a Mesas (no cambia en mitad del servicio).
let menuCache: { tenant: string; cats: Category[] } | null = null;

export default function RoundComposer({ tenant, orderId, tableName, onClose, onSent }: { tenant: string; orderId: string; tableName: string; onClose: () => void; onSent: (round: number) => void }) {
  const portal = usePortal();
  const [categories, setCategories] = useState<Category[] | null>(menuCache?.tenant === tenant ? menuCache.cats : null);
  const [cat, setCat] = useState(categories?.[0]?.slug ?? "");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [optionsFor, setOptionsFor] = useState<Product | null>(null);
  const [comboFor, setComboFor] = useState<Product | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (categories) return;
    let alive = true;
    fetch(`/api/menu/${tenant}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar la carta"))))
      .then((d) => {
        if (!alive) return;
        const cats = ((d.categories ?? []) as Category[]).filter((c) => c.products.length > 0); // sin categorías vacías
        menuCache = { tenant, cats };
        setCategories(cats);
        setCat(cats[0]?.slug ?? "");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No se pudo cargar la carta"));
    return () => {
      alive = false;
    };
  }, [tenant, categories]);

  const catalog = useMemo(() => new Map<string, ChoiceProduct>((categories ?? []).flatMap((c) => c.products.filter((p) => !p.isCombo).map((p) => [p.id, { id: p.id, name: p.name, modifierGroups: p.modifierGroups }]))), [categories]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!categories) return [];
    if (q) return categories.flatMap((c) => c.products.filter((p) => p.name.toLowerCase().includes(q)));
    return categories.find((c) => c.slug === cat)?.products ?? [];
  }, [categories, cat, q]);

  const count = lines.reduce((a, l) => a + l.quantity, 0);
  const total = lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0);

  function add(product: Product, extra: { optionIds: string[]; comboChoices?: ComboChoice[]; modifiers: OrderLineModifier[]; unitPriceCents: number }) {
    const key = `${product.id}::${[...extra.optionIds].sort().join(",")}${extra.comboChoices?.length ? `::${comboChoicesKey(extra.comboChoices)}` : ""}`;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key && !l.note);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key, productId: product.id, name: product.name, unitPriceCents: extra.unitPriceCents, quantity: 1, optionIds: extra.optionIds, comboChoices: extra.comboChoices, modifiers: extra.modifiers }];
    });
  }
  function tap(p: Product) {
    if (p.isCombo) return setComboFor(p);
    if (p.modifierGroups.length) return setOptionsFor(p);
    add(p, { optionIds: [], modifiers: [], unitPriceCents: p.basePriceCents });
  }
  const setQty = (i: number, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((_, j) => j !== i) : ls.map((l, j) => (j === i ? { ...l, quantity: qty } : l))));

  async function send() {
    if (!lines.length || sending) return;
    setSending(true);
    setError("");
    try {
      const r = await post<{ round: number }>(`/api/admin/${tenant}/mesas/${orderId}`, {
        action: "round",
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds, ...(l.comboChoices && { comboChoices: l.comboChoices }), ...(l.note?.trim() && { note: l.note.trim() }) })),
      });
      onSent(r.round);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la ronda");
      setSending(false);
    }
  }

  function close() {
    if (lines.length && !window.confirm("¿Salir sin enviar la ronda? Se perderá lo que has marcado.")) return;
    onClose();
  }

  if (!portal) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--p-bg)] text-[var(--p-ink)]" style={STORE_VARS} role="dialog" aria-modal="true" aria-label={`Nueva ronda · Mesa ${tableName}`}>
      <header className="flex items-center gap-2 border-b border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2.5 sm:px-5">
        <button type="button" onClick={close} className="p-press rounded-full px-3 py-2 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
          ‹ Mesa {tableName}
        </button>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">Nueva ronda</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-40 sm:px-5">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className="w-full rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2.5 text-sm outline-none focus:border-[var(--p-brand)]" />
        {categories && !q && (
          <nav className="-mx-3 mt-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:-mx-5 sm:px-5" style={{ scrollbarWidth: "none" }}>
            {categories.map((c) => (
              <button key={c.id} type="button" onClick={() => setCat(c.slug)} className={`p-press shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${c.slug === cat ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)]"}`}>
                {c.name}
              </button>
            ))}
          </nav>
        )}
        {!categories ? (
          <p className="py-10 text-center text-sm text-[var(--p-muted)]">{error || "Cargando la carta…"}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((p) => {
              const inRound = lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0);
              return (
                <button key={p.id} type="button" onClick={() => tap(p)} className={`p-press relative flex min-h-[92px] flex-col justify-between rounded-2xl bg-[var(--p-surface)] p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-2 ${inRound ? "ring-[var(--p-brand)]" : "ring-transparent"}`}>
                  <span className="line-clamp-2 pr-6 text-sm font-medium leading-snug">{p.name}</span>
                  <span className="mt-1.5 flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                    {euros(p.basePriceCents)}
                    {(p.isCombo || p.modifierGroups.length > 0) && <span className="text-[11px] font-normal text-[var(--p-muted)]">{p.isCombo ? "menú" : "opciones"}</span>}
                  </span>
                  {inRound > 0 && <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--p-brand)] px-2 text-xs font-bold text-white">{inRound}</span>}
                </button>
              );
            })}
            {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-[var(--p-muted)]">{q ? `Nada con «${query.trim()}».` : "Esta categoría está vacía."}</p>}
          </div>
        )}
      </div>

      {/* La ronda: barra abajo; se despliega para cambiar cantidades y notas */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--p-line)] bg-[var(--p-surface)] px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] sm:px-5">
        {listOpen && lines.length > 0 && (
          <ul className="mb-3 max-h-[45vh] space-y-2 overflow-y-auto">
            {lines.map((l, i) => (
              <li key={`${l.key}-${i}`} className="rounded-xl bg-black/[0.03] p-2.5">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.name}</p>
                    {modifierLabels(l.modifiers).length > 0 && <p className="truncate text-xs text-[var(--p-muted)]">{modifierLabels(l.modifiers).join(" · ")}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setQty(i, l.quantity - 1)} aria-label={`Quitar uno de ${l.name}`} className="p-press h-8 w-8 rounded-full bg-[var(--p-surface)] font-semibold shadow-sm">
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                    <button type="button" onClick={() => setQty(i, l.quantity + 1)} aria-label={`Añadir uno de ${l.name}`} className="p-press h-8 w-8 rounded-full bg-[var(--p-surface)] font-semibold shadow-sm">
                      +
                    </button>
                  </div>
                </div>
                <input
                  value={l.note ?? ""}
                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, note: e.target.value.slice(0, 120) } : x)))}
                  placeholder="Nota para cocina (sin cebolla, al punto…)"
                  aria-label={`Nota de ${l.name}`}
                  className="mt-2 w-full rounded-lg border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--p-brand)]"
                />
              </li>
            ))}
          </ul>
        )}
        {error && categories && <p className="mb-2 text-sm text-[var(--p-accent)]">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setListOpen((v) => !v)} disabled={!lines.length} aria-expanded={listOpen} className="p-press flex min-w-0 flex-1 flex-col items-start rounded-2xl bg-black/[0.05] px-4 py-2 text-left disabled:opacity-60">
            <span className="text-xs text-[var(--p-muted)]">{lines.length ? (listOpen ? "Ocultar la ronda" : "Ver y cambiar la ronda") : "Toca los productos"}</span>
            <span className="text-sm font-semibold tabular-nums">
              {count} {count === 1 ? "producto" : "productos"} · {euros(total)}
            </span>
          </button>
          <button type="button" onClick={send} disabled={!lines.length || sending} className="p-press shrink-0 rounded-2xl bg-[var(--p-brand)] px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-50">
            {sending ? "Enviando…" : "Enviar a cocina"}
          </button>
        </div>
      </div>

      {optionsFor && (
        <ProductOptionsSheet
          product={optionsFor as SheetProduct}
          onClose={() => setOptionsFor(null)}
          onAdd={(line) => {
            add(optionsFor, line);
            setOptionsFor(null);
          }}
        />
      )}
      {comboFor && (
        <ComboSheet
          combo={{ id: comboFor.id, name: comboFor.name, description: comboFor.description, basePriceCents: comboFor.basePriceCents, comboSlots: comboFor.comboSlots ?? [] } as ComboProduct}
          catalog={catalog}
          onClose={() => setComboFor(null)}
          onAdd={(line) => {
            add(comboFor, { optionIds: [], comboChoices: line.comboChoices, modifiers: line.modifiers, unitPriceCents: line.unitPriceCents });
            setComboFor(null);
          }}
        />
      )}
    </div>,
    portal
  );
}
