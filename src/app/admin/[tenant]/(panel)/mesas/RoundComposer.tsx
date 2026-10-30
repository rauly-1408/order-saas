"use client";

import { ask } from "@/app/lib/dialog";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ProductOptionsSheet, { NOTE_CHIPS, type SheetProduct } from "@/app/pedir/[tenant]/ProductOptionsSheet";
import ComboSheet, { type ComboProduct } from "@/app/pedir/[tenant]/ComboSheet";
import { modifierLabels, type MenuModifierGroup, type OrderLineModifier } from "@/app/lib/menuOptions";
import { comboChoicesKey, type ChoiceProduct, type ComboChoice, type ComboSlotDef } from "@/app/lib/combos";
import { STORE_VARS } from "../storeVars";
import { Sheet, Stepper, euros, parseEuros, usePortal } from "./shared";
import { loadLocal, saveLocal, sendOrQueue } from "../outbox";

// Tomar una ronda, pensado para pantalla táctil: la carta a la izquierda (o
// arriba en el móvil) y el ticket de la ronda siempre a la vista a la derecha
// (o abajo), con cantidades grandes y una nota por línea. «+ Producto libre»
// añade algo que no está en la carta solo para esta cuenta (8 chupitos,
// invitación de la casa a 0,00 €). «Enviar a cocina» imprime la comanda.
// Ver docs/MESAS.md

type Product = { id: string; name: string; description: string; basePriceCents: number; imageUrl?: string | null; modifierGroups: MenuModifierGroup[]; isCombo?: boolean; comboSlots?: ComboSlotDef[] };
type Category = { id: string; slug: string; name: string; products: Product[] };
type Line = {
  key: string;
  productId: string | null; // null = producto libre
  name: string;
  unitPriceCents: number;
  quantity: number;
  optionIds: string[];
  comboChoices?: ComboChoice[];
  modifiers: OrderLineModifier[];
  note: string;
  free?: boolean; // invita la casa
  takeaway?: boolean; // para llevar desde la mesa: «PARA LLEVAR» en la comanda y gasta su packaging
};

// Cada sección de la carta lleva siempre su color (franja en la tarjeta y punto
// en la pestaña): con el uso, el camarero encuentra los productos por el color
// sin leer. El color va con la sección, por su orden en la carta.
const SECTION_COLORS = ["#e8590c", "#1c7ed6", "#2f9e44", "#ae3ec9", "#f59f00", "#0c8599", "#d6336c", "#5c7cfa"]; // sin rojo: parecería un error
const sectionColor = (i: number) => SECTION_COLORS[i % SECTION_COLORS.length];

// La carta se carga una vez por visita a Mesas (no cambia en mitad del servicio).
let menuCache: { tenant: string; cats: Category[] } | null = null;

// orderId null + opening: mesa abierta sin conexión (se abre y se manda la ronda a la vez).
// onSent(null): sin conexión, la ronda queda guardada y se enviará sola.
export default function RoundComposer({ tenant, orderId, opening, tableName, onClose, onSent }: { tenant: string; orderId: string | null; opening?: { tableId: string; guests: number }; tableName: string; onClose: () => void; onSent: (round: number | null) => void }) {
  const portal = usePortal();
  const [categories, setCategories] = useState<Category[] | null>(menuCache?.tenant === tenant ? menuCache.cats : null);
  const [cat, setCat] = useState(categories?.[0]?.slug ?? "");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [optionsFor, setOptionsFor] = useState<Product | null>(null);
  const [comboFor, setComboFor] = useState<Product | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false); // móvil: ticket desplegado
  const [noteFor, setNoteFor] = useState<string | null>(null); // línea con la nota abierta
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<string | null>(null); // última añadida (resaltado)

  useEffect(() => {
    if (categories) return;
    let alive = true;
    fetch(`/api/menu/${tenant}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar la carta"))))
      .then((d) => {
        if (!alive) return;
        saveLocal(`menu:${tenant}`, d.categories ?? []); // para tomar nota sin conexión
        const cats = ((d.categories ?? []) as Category[]).filter((c) => c.products.length > 0); // sin categorías vacías
        menuCache = { tenant, cats };
        setCategories(cats);
        setCat(cats[0]?.slug ?? "");
      })
      .catch((e) => {
        if (!alive) return;
        const saved = loadLocal<Category[]>(`menu:${tenant}`)?.filter((c) => c.products.length > 0);
        if (saved) {
          setCategories(saved);
          setCat(saved[0]?.slug ?? "");
        } else setError(e instanceof Error ? e.message : "No se pudo cargar la carta");
      });
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

  function pushLine(l: Line) {
    setLines((ls) => {
      // Lo mismo sin nota se suma a la línea que ya hay.
      const i = l.note ? -1 : ls.findIndex((x) => x.key === l.key && !x.note);
      if (i >= 0) return ls.map((x, j) => (j === i ? { ...x, quantity: x.quantity + l.quantity } : x));
      return [...ls, l];
    });
    setFlash(l.key);
    setTimeout(() => setFlash((f) => (f === l.key ? null : f)), 700);
  }
  function add(product: Product, extra: { optionIds: string[]; comboChoices?: ComboChoice[]; modifiers: OrderLineModifier[]; unitPriceCents: number; note?: string }) {
    const key = `${product.id}::${[...extra.optionIds].sort().join(",")}${extra.comboChoices?.length ? `::${comboChoicesKey(extra.comboChoices)}` : ""}`;
    pushLine({ key, productId: product.id, name: product.name, unitPriceCents: extra.unitPriceCents, quantity: 1, optionIds: extra.optionIds, comboChoices: extra.comboChoices, modifiers: extra.modifiers, note: extra.note ?? "" });
  }
  function tap(p: Product) {
    if (p.isCombo) return setComboFor(p);
    if (p.modifierGroups.length) return setOptionsFor(p);
    add(p, { optionIds: [], modifiers: [], unitPriceCents: p.basePriceCents });
  }
  // «−» en la tarjeta: quita uno de la última línea de ese producto.
  function removeOne(productId: string) {
    setLines((ls) => {
      const i = ls.map((l) => l.productId).lastIndexOf(productId);
      if (i < 0) return ls;
      return ls[i].quantity <= 1 ? ls.filter((_, j) => j !== i) : ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity - 1 } : l));
    });
  }
  const colorOf = useMemo(() => new Map((categories ?? []).flatMap((c, i) => c.products.map((p) => [p.id, sectionColor(i)] as const))), [categories]);
  const setQty = (i: number, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((_, j) => j !== i) : ls.map((l, j) => (j === i ? { ...l, quantity: qty } : l))));
  const setNote = (i: number, note: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, note: note.slice(0, 120) } : l)));

  async function send() {
    if (!lines.length || sending) return;
    setSending(true);
    setError("");
    try {
      const menu = lines.filter((l) => l.productId);
      const custom = lines.filter((l) => !l.productId);
      const round = {
        items: menu.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds, ...(l.comboChoices && { comboChoices: l.comboChoices }), ...(l.note.trim() && { note: l.note.trim() }), ...(l.takeaway && { takeaway: true }) })),
        custom: custom.map((l) => ({ name: l.name, quantity: l.quantity, priceCents: l.unitPriceCents, free: Boolean(l.free), note: l.note.trim() })),
      };
      const label = `Mesa ${tableName} · ronda de ${count} ${count === 1 ? "producto" : "productos"}`;
      // Para enseñar la ronda en la cuenta mientras no hay conexión (el servidor recalcula los precios).
      const preview = { lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, totalCents: l.free ? 0 : l.unitPriceCents * l.quantity, modifiers: modifierLabels(l.modifiers), note: l.note.trim() || null })) };
      const r = orderId
        ? await sendOrQueue<{ round: number }>(`/api/admin/${tenant}/mesas/${orderId}`, { action: "round", ...round, preview }, label)
        : await sendOrQueue<{ round: number }>(`/api/admin/${tenant}/mesas`, { action: "open", tableId: opening?.tableId, guests: opening?.guests ?? 1, round, preview }, label);
      onSent(r.queued ? null : r.data.round);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la ronda");
      setSending(false);
    }
  }

  async function close() {
    if (lines.length && !(await ask("¿Salir sin enviar la ronda? Se perderá lo que has marcado."))) return;
    onClose();
  }

  // El ticket de la ronda (columna en el ordenador, desplegable en el móvil).
  const ticket = (
    <>
      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-base font-semibold">La ronda está vacía</p>
          <p className="mt-1 text-sm text-[var(--p-muted)]">Toca los productos para añadirlos. Cada toque suma uno.</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {lines.map((l, i) => {
            const mods = modifierLabels(l.modifiers);
            const noteOpen = noteFor === `${l.key}-${i}`;
            return (
              <li key={`${l.key}-${i}`} className={`rounded-2xl p-3 transition-colors ${flash === l.key ? "bg-[var(--p-brand-soft)]" : "bg-black/[0.035]"}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug">
                      {l.name}
                      {!l.productId && <span className="ml-1.5 rounded-md bg-black/[0.07] px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase text-[var(--p-muted)]">libre</span>}
                    </p>
                    {mods.length > 0 && <p className="text-xs text-[var(--p-muted)]">{mods.join(" · ")}</p>}
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">{l.free ? "Invita la casa · 0,00 €" : euros(l.unitPriceCents * l.quantity)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => setQty(i, l.quantity - 1)} aria-label={l.quantity === 1 ? `Quitar ${l.name}` : `Uno menos de ${l.name}`} className="p-press flex h-11 w-11 items-center justify-center rounded-full bg-[var(--p-surface)] text-xl font-semibold shadow-sm">
                      {l.quantity === 1 ? <TrashIcon /> : "−"}
                    </button>
                    <span className="w-8 text-center text-lg font-bold tabular-nums">{l.quantity}</span>
                    <button type="button" onClick={() => setQty(i, l.quantity + 1)} aria-label={`Uno más de ${l.name}`} className="p-press flex h-11 w-11 items-center justify-center rounded-full bg-[var(--p-surface)] text-xl font-semibold shadow-sm">
                      +
                    </button>
                  </div>
                </div>
                {l.note && !noteOpen && (
                  <button type="button" onClick={() => setNoteFor(`${l.key}-${i}`)} className="mt-2 w-full rounded-xl bg-amber-50 px-3 py-2 text-left text-sm font-semibold text-amber-900 wrap-anywhere">
                    ✎ {l.note}
                  </button>
                )}
                {!noteOpen && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!l.note && (
                      <button type="button" onClick={() => setNoteFor(`${l.key}-${i}`)} className="rounded-full px-3 py-2 text-sm font-semibold text-[var(--p-brand)] hover:bg-[var(--p-brand-soft)]">
                        + Nota para cocina
                      </button>
                    )}
                    {l.productId && (
                      <button
                        type="button"
                        aria-pressed={!!l.takeaway}
                        onClick={() => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, takeaway: !x.takeaway } : x)))}
                        className={`p-press rounded-full px-3 py-2 text-sm font-semibold ${l.takeaway ? "bg-[var(--p-ink)] text-white" : "border border-[var(--p-line)] bg-[var(--p-surface)] text-[var(--p-ink)]"}`}
                      >
                        {l.takeaway ? "✓ Para llevar" : "Para llevar"}
                      </button>
                    )}
                  </div>
                )}
                {noteOpen && (
                  <div className="mt-2">
                    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                      {NOTE_CHIPS.map((c) => (
                        <button key={c} type="button" onClick={() => setNote(i, l.note.trim() ? `${l.note.trim()}, ${c}` : c)} className="p-press shrink-0 rounded-full border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2 text-[13px] font-medium">
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 flex gap-2">
                      <input autoFocus value={l.note} onChange={(e) => setNote(i, e.target.value)} onKeyDown={(e) => e.key === "Enter" && setNoteFor(null)} placeholder="Sin tomate, extra de queso…" aria-label={`Nota de ${l.name}`} className="min-w-0 flex-1 rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2.5 text-[15px] outline-none focus:border-[var(--p-brand)]" />
                      <button type="button" onClick={() => setNoteFor(null)} className="p-press shrink-0 rounded-xl bg-[var(--p-ink)] px-4 text-sm font-semibold text-white">
                        Listo
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && categories && <p className="mt-2 text-sm text-[var(--p-accent)]">{error}</p>}
      <button type="button" onClick={send} disabled={!lines.length || sending} className="p-press mt-3 flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--p-brand)] px-5 py-4 text-left text-white disabled:opacity-40">
        <span className="text-lg font-bold">{sending ? "Enviando…" : "Enviar a cocina"}</span>
        <span className="text-sm font-semibold tabular-nums opacity-90">
          {count} · {euros(total)}
        </span>
      </button>
    </>
  );

  if (!portal) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--p-bg)] text-[var(--p-ink)]" style={STORE_VARS} role="dialog" aria-modal="true" aria-label={`Nueva ronda · Mesa ${tableName}`}>
      <header className="flex items-center gap-2 border-b border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2 sm:px-5">
        <button type="button" onClick={close} className="p-press min-h-12 shrink-0 rounded-full bg-black/[0.06] px-5 text-base font-semibold hover:bg-black/[0.09]">
          ‹ Mesa {tableName}
        </button>
        <h2 className="hidden min-w-0 flex-1 truncate text-base font-semibold text-[var(--p-muted)] sm:block">Nueva ronda</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className="ml-auto w-full min-w-0 max-w-sm rounded-full border border-[var(--p-line)] bg-[var(--p-bg)] px-4 py-3 text-base outline-none focus:border-[var(--p-brand)]" />
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Carta */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-36 sm:px-5 lg:pb-6">
          {categories && !q && (
            <nav className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:-mx-5 sm:px-5" aria-label="Categorías">
              {categories.map((c, i) => (
                <button key={c.id} type="button" onClick={() => setCat(c.slug)} aria-pressed={c.slug === cat} className={`p-press flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold ${c.slug === cat ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"}`}>
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sectionColor(i) }} />
                  {c.name}
                </button>
              ))}
            </nav>
          )}
          {!categories ? (
            <p className="py-10 text-center text-sm text-[var(--p-muted)]">{error || "Cargando la carta…"}</p>
          ) : (
            <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              <button type="button" onClick={() => setCustomOpen(true)} className="p-press flex min-h-[112px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--p-brand)]/40 p-3 text-center text-[var(--p-brand)]">
                <span className="text-2xl font-bold leading-none">+</span>
                <span className="mt-1 text-[15px] font-semibold">Producto libre</span>
                <span className="text-xs opacity-80">Fuera de carta o invitación</span>
              </button>
              {shown.map((p) => {
                const inRound = lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0);
                const color = colorOf.get(p.id);
                return (
                  <div key={p.id} className="relative">
                    <button type="button" onClick={() => tap(p)} className={`p-press relative flex h-full min-h-[120px] w-full flex-col justify-between overflow-hidden rounded-2xl bg-[var(--p-surface)] py-3.5 pr-3.5 pl-5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-2 transition-shadow ${inRound ? "ring-[var(--p-brand)]" : "ring-transparent"}`}>
                      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />
                      <span className="flex items-start gap-2.5">
                        {p.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        )}
                        <span className="line-clamp-3 min-w-0 pr-8 text-base font-semibold leading-snug">{p.name}</span>
                      </span>
                      <span className="mt-2 flex items-baseline gap-1.5 pr-12 text-base font-bold tabular-nums">
                        {euros(p.basePriceCents)}
                        {(p.isCombo || p.modifierGroups.length > 0) && <span className="text-xs font-normal text-[var(--p-muted)]">{p.isCombo ? "menú" : "opciones"}</span>}
                      </span>
                      {inRound > 0 && <span className="absolute right-2.5 top-2.5 flex h-8 min-w-8 items-center justify-center rounded-full bg-[var(--p-brand)] px-2 text-sm font-bold text-white">{inRound}</span>}
                    </button>
                    {inRound > 0 && (
                      <button type="button" onClick={() => removeOne(p.id)} aria-label={`Quitar uno de ${p.name}`} className="p-press absolute right-1.5 bottom-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-black/[0.07] text-2xl font-semibold leading-none">
                        −
                      </button>
                    )}
                  </div>
                );
              })}
              {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-[var(--p-muted)]">{q ? `Nada con «${query.trim()}». Usa «Producto libre» si no está en la carta.` : "Esta categoría está vacía."}</p>}
            </div>
          )}
        </div>

        {/* Ticket de la ronda: columna fija en el ordenador o la tablet */}
        <aside className="hidden w-[400px] shrink-0 flex-col border-l border-[var(--p-line)] bg-[var(--p-surface)] p-4 lg:flex" aria-label="Ronda">
          <p className="mb-3 flex items-center justify-between text-base font-semibold">
            Ronda · Mesa {tableName}
            {lines.length > 0 && (
              <button type="button" onClick={async () => (await ask("¿Vaciar la ronda? Se quita todo lo marcado y no se envía nada a cocina.", { confirm: "Vaciar", danger: true })) && setLines([])} className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
                Vaciar
              </button>
            )}
          </p>
          {ticket}
        </aside>
      </div>

      {/* Móvil: barra abajo que se despliega en el ticket */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--p-line)] bg-[var(--p-surface)] px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] lg:hidden">
        {ticketOpen ? (
          <div className="flex max-h-[70vh] flex-col">
            <button type="button" onClick={() => setTicketOpen(false)} className="mb-2 w-full rounded-xl py-2 text-sm font-semibold text-[var(--p-muted)]">
              ▾ Ocultar la ronda
            </button>
            {ticket}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTicketOpen(true)} disabled={!lines.length} className="p-press flex min-w-0 flex-1 flex-col items-start rounded-2xl bg-black/[0.05] px-4 py-2.5 text-left disabled:opacity-60">
              <span className="text-xs text-[var(--p-muted)]">{lines.length ? "▴ Ver la ronda y notas" : "Toca los productos"}</span>
              <span className="text-base font-semibold tabular-nums">
                {count} {count === 1 ? "producto" : "productos"} · {euros(total)}
              </span>
            </button>
            <button type="button" onClick={send} disabled={!lines.length || sending} className="p-press shrink-0 rounded-2xl bg-[var(--p-brand)] px-5 py-4 text-base font-bold text-white disabled:opacity-40">
              {sending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        )}
      </div>

      {optionsFor && (
        <ProductOptionsSheet
          product={optionsFor as SheetProduct}
          withNote
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
          withNote
          onClose={() => setComboFor(null)}
          onAdd={(line) => {
            add(comboFor, { optionIds: [], comboChoices: line.comboChoices, modifiers: line.modifiers, unitPriceCents: line.unitPriceCents, note: line.note });
            setComboFor(null);
          }}
        />
      )}
      {customOpen && (
        <CustomSheet
          onClose={() => setCustomOpen(false)}
          onAdd={(c) => {
            pushLine({ key: `libre:${c.name.toLowerCase()}:${c.priceCents}:${c.free ? 1 : 0}`, productId: null, name: c.name, unitPriceCents: c.priceCents, quantity: c.quantity, optionIds: [], modifiers: [], note: c.note, free: c.free });
            setCustomOpen(false);
          }}
        />
      )}
    </div>,
    portal
  );
}

const CUSTOM_IDEAS = ["Chupito", "Café", "Agua", "Pan", "Postre del día", "Plato del día"];

// Producto libre: lo que no está en la carta, solo para esta cuenta.
function CustomSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (c: { name: string; quantity: number; priceCents: number; free: boolean; note: string }) => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState("");
  const [free, setFree] = useState(false);
  const [note, setNote] = useState("");
  const priceCents = free ? 0 : price.trim() ? parseEuros(price) : NaN;
  const valid = name.trim().length > 0 && Number.isInteger(priceCents) && priceCents >= 0 && priceCents <= 99_999;
  return (
    <Sheet
      title="Producto libre"
      onClose={onClose}
      footer={
        <button type="button" disabled={!valid} onClick={() => onAdd({ name: name.trim().slice(0, 60), quantity, priceCents: Number.isInteger(priceCents) ? priceCents : 0, free, note: note.trim() })} className="p-press w-full rounded-2xl bg-[var(--p-brand)] py-4 text-base font-bold text-white disabled:opacity-40">
          {valid ? `Añadir ${quantity} × ${name.trim() || "producto"} · ${free ? "invita la casa" : euros(priceCents * quantity)}` : "Escribe el nombre y el precio"}
        </button>
      }
    >
      <p className="text-sm text-[var(--p-muted)]">Solo para esta cuenta. No se guarda en la carta ni descuenta stock.</p>
      <label className="mt-4 block text-[13px] font-semibold" htmlFor="libre-nombre">
        Qué es
      </label>
      <input id="libre-nombre" autoFocus value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Chupitos, café, plato fuera de carta…" className="mt-1 w-full rounded-xl border border-[var(--p-line)] px-4 py-3 text-base outline-none focus:border-[var(--p-brand)]" />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CUSTOM_IDEAS.map((c) => (
          <button key={c} type="button" onClick={() => setName(c)} className="p-press rounded-full border border-[var(--p-line)] px-3.5 py-2 text-sm font-medium">
            {c}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[13px] font-semibold">Cantidad</p>
          <div className="mt-1">
            <Stepper value={quantity} min={1} max={50} onChange={setQuantity} label="cantidad" />
          </div>
        </div>
        <div>
          <label className="text-[13px] font-semibold" htmlFor="libre-precio">
            Precio por unidad (€)
          </label>
          <input id="libre-precio" value={free ? "0,00" : price} disabled={free} onChange={(e) => setPrice(e.target.value.replace(/[^\d,.]/g, "").slice(0, 7))} inputMode="decimal" placeholder="2,50" className="mt-1 w-full rounded-xl border border-[var(--p-line)] px-4 py-3 text-base tabular-nums outline-none focus:border-[var(--p-brand)] disabled:bg-black/[0.04]" />
        </div>
      </div>
      <button type="button" role="switch" aria-checked={free} onClick={() => setFree((v) => !v)} className={`mt-4 flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left ${free ? "border-amber-500 bg-amber-50" : "border-[var(--p-line)]"}`}>
        <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${free ? "bg-amber-500" : "bg-black/15"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${free ? "left-6" : "left-1"}`} />
        </span>
        <span>
          <span className="block text-[15px] font-semibold">Invita la casa</span>
          <span className="block text-xs text-[var(--p-muted)]">A 0,00 €. En la comanda y en el ticket sale «Invita la casa».</span>
        </span>
      </button>
      <label className="mt-4 block text-[13px] font-semibold" htmlFor="libre-nota">
        Nota para cocina o barra (opcional)
      </label>
      <input id="libre-nota" value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} placeholder="De hierbas, sin hielo…" className="mt-1 w-full rounded-xl border border-[var(--p-line)] px-4 py-3 text-base outline-none focus:border-[var(--p-brand)]" />
    </Sheet>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}
