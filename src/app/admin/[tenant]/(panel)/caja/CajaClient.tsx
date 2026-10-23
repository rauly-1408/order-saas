"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ProductOptionsSheet, { type SheetProduct } from "@/app/pedir/[tenant]/ProductOptionsSheet";
import ComboSheet, { type ComboProduct } from "@/app/pedir/[tenant]/ComboSheet";
import { modifierLabels, type MenuModifierGroup, type OrderLineModifier } from "@/app/lib/menuOptions";
import { comboChoicesKey, type ChoiceProduct, type ComboChoice, type ComboSlotDef } from "@/app/lib/combos";

// Caja: tomar un pedido en el mostrador o por teléfono y mandarlo a cocina.
// Reutiliza las hojas de opciones y de menús de la tienda. Ver docs/CAJA.md

type Product = { id: string; name: string; description: string; basePriceCents: number; modifierGroups: MenuModifierGroup[]; isCombo?: boolean; comboSlots?: ComboSlotDef[] };
type Category = { id: string; slug: string; name: string; products: Product[] };
type Line = { key: string; productId: string; name: string; unitPriceCents: number; quantity: number; optionIds: string[]; comboChoices?: ComboChoice[]; modifiers: OrderLineModifier[] };
type Payment = "CASH" | "CARD_TERMINAL" | "BIZUM" | "IN_STORE";

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const parseEuros = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);

// Las hojas de la tienda usan sus propias variables de color: aquí se mapean a las del panel.
const STORE_VARS = {
  "--bg-base": "var(--p-bg)",
  "--surface-0": "var(--p-bg)",
  "--surface-1": "var(--p-surface)",
  "--border": "var(--p-line)",
  "--text-primary": "var(--p-ink)",
  "--text-secondary": "var(--p-muted)",
  "--brand-accent": "var(--p-brand)",
  "--on-accent": "#ffffff",
  "--brand-secondary": "var(--p-accent)",
  "--on-secondary": "#ffffff",
  "--font-body": "inherit",
  "--font-heading": "inherit",
  "--heading-case": "none",
  "--border-radius": "14px",
} as React.CSSProperties;

export default function CajaClient({ tenant }: { tenant: string }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState("");
  const [cat, setCat] = useState("");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [optionsFor, setOptionsFor] = useState<Product | null>(null);
  const [comboFor, setComboFor] = useState<Product | null>(null);
  const [source, setSource] = useState<"COUNTER" | "PHONE">("COUNTER");
  const [mode, setMode] = useState<"TAKEAWAY" | "DINE_IN" | "DELIVERY">("TAKEAWAY");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [payment, setPayment] = useState<Payment>("CASH");
  const [tendered, setTendered] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ orderNumber: number | null; totalCents: number; changeCents: number | null } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // ticket en el móvil
  // Las hojas y la barra del móvil se pintan en .panel (fuera de .p-page): la
  // animación de entrada de la página encierra los elementos «fixed».
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortal((document.querySelector(".panel") as HTMLElement | null) ?? document.body);
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/menu/${tenant}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar la carta"))))
      .then((d) => {
        if (!alive) return;
        const cats = (d.categories ?? []) as Category[];
        setCategories(cats);
        setCat(cats[0]?.slug ?? "");
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "No se pudo cargar la carta"));
    return () => {
      alive = false;
    };
  }, [tenant]);

  // Productos simples de la carta: lo que se puede elegir dentro de un menú.
  const catalog = useMemo(() => new Map<string, ChoiceProduct>((categories ?? []).flatMap((c) => c.products.filter((p) => !p.isCombo).map((p) => [p.id, { id: p.id, name: p.name, modifierGroups: p.modifierGroups }]))), [categories]);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!categories) return [];
    if (q) return categories.flatMap((c) => c.products.filter((p) => p.name.toLowerCase().includes(q)));
    return categories.find((c) => c.slug === cat)?.products ?? [];
  }, [categories, cat, q]);

  const subtotal = lines.reduce((a, l) => a + l.unitPriceCents * l.quantity, 0);
  const count = lines.reduce((a, l) => a + l.quantity, 0);
  const tenderedCents = payment === "CASH" && tendered.trim() ? parseEuros(tendered) : null;
  const change = tenderedCents != null && tenderedCents >= subtotal ? tenderedCents - subtotal : null;

  function add(product: Product, extra: { optionIds: string[]; comboChoices?: ComboChoice[]; modifiers: OrderLineModifier[]; unitPriceCents: number }) {
    const key = `${product.id}::${[...extra.optionIds].sort().join(",")}${extra.comboChoices?.length ? `::${comboChoicesKey(extra.comboChoices)}` : ""}`;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key, productId: product.id, name: product.name, unitPriceCents: extra.unitPriceCents, quantity: 1, optionIds: extra.optionIds, comboChoices: extra.comboChoices, modifiers: extra.modifiers }];
    });
    setDone(null);
  }
  function tap(product: Product) {
    if (product.isCombo) return setComboFor(product);
    if (product.modifierGroups.length) return setOptionsFor(product);
    add(product, { optionIds: [], modifiers: [], unitPriceCents: product.basePriceCents });
  }
  const setQty = (key: string, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, quantity: qty } : l))));

  function reset() {
    setLines([]);
    setName("");
    setPhone("");
    setAddress("");
    setNotes("");
    setCoupon("");
    setTendered("");
    setMode("TAKEAWAY");
    setSheetOpen(false);
  }

  async function submit() {
    if (!lines.length || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/${tenant}/caja`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, optionIds: l.optionIds, ...(l.comboChoices && { comboChoices: l.comboChoices }) })),
          source,
          channel: mode === "DELIVERY" ? "DELIVERY" : "TAKEAWAY",
          dineIn: mode === "DINE_IN",
          customerName: name,
          customerPhone: phone,
          customerAddress: address,
          notes,
          couponCode: coupon,
          paymentMethod: payment,
          ...(tenderedCents != null && { cashTenderedCents: tenderedCents }),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo crear el pedido");
      setDone({ orderNumber: json.orderNumber, totalCents: json.totalCents, changeCents: json.changeCents });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setSending(false);
    }
  }

  const ticket = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pedido</h2>
        {lines.length > 0 && (
          <button type="button" onClick={() => setLines([])} className="text-xs font-medium text-[var(--p-muted)] hover:underline">
            Vaciar
          </button>
        )}
      </div>
      <ul className="mt-2 flex-1 divide-y divide-[var(--p-line)] overflow-y-auto">
        {lines.length === 0 && <li className="py-8 text-center text-sm text-[var(--p-muted)]">Toca productos para añadirlos.</li>}
        {lines.map((l) => {
          const mods = modifierLabels(l.modifiers);
          return (
            <li key={l.key} className="flex items-start gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.name}</p>
                {mods.length > 0 && <p className="truncate text-xs text-[var(--p-muted)]">{mods.join(" · ")}</p>}
                <p className="text-xs text-[var(--p-muted)]">{euros(l.unitPriceCents)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setQty(l.key, l.quantity - 1)} aria-label="Quitar uno" className="p-press h-8 w-8 rounded-full bg-black/[0.05] text-lg leading-none">
                  −
                </button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                <button type="button" onClick={() => setQty(l.key, l.quantity + 1)} aria-label="Añadir uno" className="p-press h-8 w-8 rounded-full bg-black/[0.05] text-lg leading-none">
                  +
                </button>
              </div>
              <span className="w-16 text-right text-sm font-semibold tabular-nums">{euros(l.unitPriceCents * l.quantity)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 space-y-3 border-t border-[var(--p-line)] pt-3">
        <div className="grid grid-cols-2 gap-2">
          <Seg value={source} onChange={setSource} options={[["COUNTER", "Mostrador"], ["PHONE", "Teléfono"]]} />
          <Seg value={mode} onChange={setMode} options={[["TAKEAWAY", "Llevar"], ["DINE_IN", "Aquí"], ["DELIVERY", "Domicilio"]]} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (opcional)" aria-label="Nombre del cliente" className="min-w-0 rounded-lg px-3 py-2 text-sm" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (sellos)" inputMode="tel" aria-label="Teléfono del cliente" className="min-w-0 rounded-lg px-3 py-2 text-sm" />
        </div>
        {mode === "DELIVERY" && <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección de entrega" aria-label="Dirección" className="w-full rounded-lg px-3 py-2 text-sm" />}
        <div className="grid grid-cols-2 gap-2">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas para cocina" aria-label="Notas" className="min-w-0 rounded-lg px-3 py-2 text-sm" />
          <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Cupón" aria-label="Cupón" className="min-w-0 rounded-lg px-3 py-2 text-sm uppercase" />
        </div>
        <Seg value={payment} onChange={setPayment} options={[["CASH", "Efectivo"], ["CARD_TERMINAL", "Datáfono"], ["BIZUM", "Bizum"], ["IN_STORE", "Al recoger"]]} />
        {payment === "CASH" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--p-muted)]">Entrega</label>
            <input value={tendered} onChange={(e) => setTendered(e.target.value)} inputMode="decimal" placeholder="0,00" aria-label="Efectivo entregado" className="w-24 rounded-lg px-3 py-2 text-right text-sm tabular-nums" />
            <span className="text-xs text-[var(--p-muted)]">€</span>
            {change != null && (
              <span className="ml-auto text-sm font-semibold text-emerald-700">
                Cambio {euros(change)}
              </span>
            )}
            {tenderedCents != null && tenderedCents < subtotal && <span className="ml-auto text-xs text-[var(--p-accent)]">Falta {euros(subtotal - tenderedCents)}</span>}
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[var(--p-muted)]">
            {count} {count === 1 ? "artículo" : "artículos"}
            {mode === "DELIVERY" && " · envío según la zona"}
          </span>
          <span className="text-2xl font-semibold tabular-nums">{euros(subtotal)}</span>
        </div>
        <button type="button" onClick={submit} disabled={!lines.length || sending} className="p-press w-full rounded-full bg-[var(--p-brand)] py-3.5 text-[15px] font-semibold text-white disabled:opacity-40">
          {sending ? "Enviando…" : payment === "IN_STORE" ? "Enviar a cocina (cobrar al recoger)" : "Cobrar y enviar a cocina"}
        </button>
        {error && <p className="text-sm text-[var(--p-accent)]">{error}</p>}
      </div>
    </div>
  );

  return (
    <div className="-mx-4 -mt-20 flex min-h-screen flex-col lg:-mx-10 lg:-mt-10 lg:h-[calc(100vh-0px)] lg:flex-row" style={STORE_VARS}>
      {/* Carta */}
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-20 pb-28 lg:px-8 lg:pt-8 lg:pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm sm:max-w-xs" />
        </div>
        {done && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            <span>
              ✓ Pedido <b>nº {done.orderNumber}</b> enviado a cocina · {euros(done.totalCents)}
              {done.changeCents != null && done.changeCents > 0 && (
                <>
                  {" "}· <b>Cambio: {euros(done.changeCents)}</b>
                </>
              )}
            </span>
            <button type="button" onClick={() => setDone(null)} className="text-xs font-semibold underline">
              Cerrar
            </button>
          </div>
        )}
        {error && !lines.length && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
        {categories && !q && (
          <nav className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" style={{ scrollbarWidth: "none" }}>
            {categories.map((c) => (
              <button key={c.id} type="button" onClick={() => setCat(c.slug)} className={`p-press shrink-0 rounded-full px-4 py-2 text-sm font-medium ${c.slug === cat ? "bg-[var(--p-brand)] text-white" : "bg-[var(--p-surface)] text-[var(--p-ink)]"}`}>
                {c.name}
              </button>
            ))}
          </nav>
        )}
        {!categories ? (
          <p className="py-10 text-center text-sm text-[var(--p-muted)]">Cargando la carta…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => {
              const inOrder = lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0);
              return (
                <button key={p.id} type="button" onClick={() => tap(p)} className="p-press relative flex min-h-[84px] flex-col justify-between rounded-2xl bg-[var(--p-surface)] p-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <span className="text-sm font-medium leading-snug">{p.name}</span>
                  <span className="mt-1 text-sm font-semibold tabular-nums text-[var(--p-brand)]">
                    {euros(p.basePriceCents)}
                    {(p.isCombo || p.modifierGroups.length > 0) && <span className="ml-1 text-xs font-normal text-[var(--p-muted)]">+ opciones</span>}
                  </span>
                  {inOrder > 0 && <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--p-brand)] px-1.5 text-xs font-bold text-white">{inOrder}</span>}
                </button>
              );
            })}
            {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-[var(--p-muted)]">Nada que mostrar.</p>}
          </div>
        )}
      </div>

      {/* Ticket: columna en ordenador, hoja desde abajo en el móvil */}
      <aside className="hidden w-[380px] shrink-0 border-l border-[var(--p-line)] bg-[var(--p-surface)] p-5 lg:block">{ticket}</aside>
      {portal &&
        createPortal(
          <div style={STORE_VARS}>
            <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
              {sheetOpen ? (
                <div className="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label="Pedido">
                  <button type="button" aria-label="Cerrar" onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-black/40" />
                  <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[24px] bg-[var(--p-surface)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[var(--p-ink)]">
                    <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15" />
                    {ticket}
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setSheetOpen(true)} disabled={!lines.length} className="p-press mx-4 mb-4 flex w-[calc(100%-32px)] items-center justify-between rounded-full bg-[var(--p-brand)] px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg disabled:opacity-40">
                  <span>Ver pedido · {count}</span>
                  <span className="tabular-nums">{euros(subtotal)}</span>
                </button>
              )}
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
        )}
    </div>
  );
}

// Botonera de opciones excluyentes.
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-xl bg-black/[0.05] p-1" role="radiogroup">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`flex-1 rounded-lg px-1 py-1.5 text-xs font-medium ${value === v ? "bg-[var(--p-surface)] shadow-sm" : "text-[var(--p-muted)]"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
