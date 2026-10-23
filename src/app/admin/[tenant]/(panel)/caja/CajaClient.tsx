"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ProductOptionsSheet, { type SheetProduct } from "@/app/pedir/[tenant]/ProductOptionsSheet";
import ComboSheet, { type ComboProduct } from "@/app/pedir/[tenant]/ComboSheet";
import { modifierLabels, type MenuModifierGroup, type OrderLineModifier } from "@/app/lib/menuOptions";
import { comboChoicesKey, type ChoiceProduct, type ComboChoice, type ComboSlotDef } from "@/app/lib/combos";
import type { HoyPayment, HoyResponse } from "@/app/api/admin/[tenant]/caja/hoy/route";

// Caja: tomar un pedido en el mostrador o por teléfono, cobrarlo y mandarlo a
// cocina. Tres pantallas en el ticket: pedido → cobro → confirmación, como en
// un TPV (Square, Shopify POS). Reutiliza las hojas de opciones y de menús de
// la tienda. Ver docs/CAJA.md

type Product = { id: string; name: string; description: string; basePriceCents: number; imageUrl?: string | null; modifierGroups: MenuModifierGroup[]; isCombo?: boolean; comboSlots?: ComboSlotDef[] };
type Category = { id: string; slug: string; name: string; products: Product[] };
type Line = { key: string; productId: string; name: string; unitPriceCents: number; quantity: number; optionIds: string[]; comboChoices?: ComboChoice[]; modifiers: OrderLineModifier[] };
type Payment = "CASH" | "CARD_TERMINAL" | "BIZUM" | "IN_STORE";
type Mode = "TAKEAWAY" | "DINE_IN" | "DELIVERY";
type Step = "order" | "pay" | "done";

const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
const parseEuros = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
const MODE_LABEL: Record<Mode, string> = { TAKEAWAY: "Para llevar", DINE_IN: "Comer aquí", DELIVERY: "A domicilio" };
const PAYMENT_LABEL: Record<Payment, string> = { CASH: "Efectivo", CARD_TERMINAL: "Datáfono", BIZUM: "Bizum", IN_STORE: "Pagar al recoger" };
const HOY_PAYMENT_LABEL: Record<HoyPayment, string> = { CASH: "Efectivo", CARD_TERMINAL: "Datáfono", BIZUM: "Bizum", CARD: "Tarjeta online", IN_STORE: "Al recoger" };
const STATUS_LABEL: Record<string, string> = { CREATED: "Nuevo", PAID: "Nuevo", SENT_TO_POS: "Nuevo", ACCEPTED: "Preparando", PREPARING: "Preparando", READY: "Listo", DELIVERING: "En reparto", DELIVERED: "Entregado", CANCELLED: "Cancelado" };
const hourOf = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

// Importes rápidos para el efectivo: el justo y los billetes que lo cubren.
function quickAmounts(totalCents: number): number[] {
  const out = new Set<number>([totalCents]);
  for (const bill of [500, 1000, 2000, 5000]) {
    const n = Math.ceil(totalCents / bill) * bill;
    if (n >= totalCents) out.add(n);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

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
  const [mode, setMode] = useState<Mode>("TAKEAWAY");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [coupon, setCoupon] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [payment, setPayment] = useState<Payment>("CASH");
  const [tendered, setTendered] = useState("");
  const [sending, setSending] = useState(false);
  const [step, setStep] = useState<Step>("order");
  const [done, setDone] = useState<{ orderNumber: number | null; totalCents: number; changeCents: number | null; payment: Payment } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false); // ticket en el móvil
  const [hoy, setHoy] = useState<HoyResponse | null>(null);
  const [hoyOpen, setHoyOpen] = useState(false);
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

  // Resumen «Hoy en caja»: al entrar, tras cada venta y al abrirlo.
  const loadHoy = useCallback(() => {
    fetch(`/api/admin/${tenant}/caja/hoy`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setHoy(d as HoyResponse))
      .catch(() => {});
  }, [tenant]);
  useEffect(() => {
    loadHoy();
  }, [loadHoy]);
  useEffect(() => {
    if (hoyOpen) loadHoy();
  }, [hoyOpen, loadHoy]);

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
  const missing = tenderedCents != null && tenderedCents < subtotal ? subtotal - tenderedCents : null;
  const detailsSummary = [name, phone, coupon && `cupón ${coupon.toUpperCase()}`, notes && `nota: ${notes}`].filter(Boolean).join(" · ");
  const canConfirm = lines.length > 0 && !sending && (mode !== "DELIVERY" || address.trim().length > 0) && (payment !== "CASH" || tenderedCents == null || tenderedCents >= subtotal);

  function add(product: Product, extra: { optionIds: string[]; comboChoices?: ComboChoice[]; modifiers: OrderLineModifier[]; unitPriceCents: number }) {
    const key = `${product.id}::${[...extra.optionIds].sort().join(",")}${extra.comboChoices?.length ? `::${comboChoicesKey(extra.comboChoices)}` : ""}`;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === key);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key, productId: product.id, name: product.name, unitPriceCents: extra.unitPriceCents, quantity: 1, optionIds: extra.optionIds, comboChoices: extra.comboChoices, modifiers: extra.modifiers }];
    });
    if (step !== "order") {
      setStep("order");
      setDone(null);
    }
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
    setPayment("CASH");
    setDetailsOpen(false);
    setError("");
  }
  function newOrder() {
    setDone(null);
    setStep("order");
    setSheetOpen(false);
  }
  function keypad(k: string) {
    setTendered((v) => {
      if (k === "⌫") return v.slice(0, -1);
      if (k === ",") return v.includes(",") ? v : (v || "0") + ",";
      const [, dec] = v.split(",");
      if (dec !== undefined && dec.length >= 2) return v;
      if (v === "0" && !v.includes(",")) return k;
      return v.length >= 7 ? v : v + k;
    });
  }

  async function submit() {
    if (!canConfirm) return;
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
      setDone({ orderNumber: json.orderNumber, totalCents: json.totalCents, changeCents: json.changeCents, payment });
      reset();
      setStep("done");
      loadHoy();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setSending(false);
    }
  }

  // ── Pantalla 1: el pedido ───────────────────────────────────────────────
  const orderView = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pedido</h2>
        {lines.length > 0 && (
          <button type="button" onClick={() => setLines([])} className="rounded-full px-3 py-1 text-xs font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
            Vaciar
          </button>
        )}
      </div>
      <div className="mt-3 flex gap-1.5 rounded-xl bg-black/[0.05] p-1" role="radiogroup" aria-label="Tipo de pedido">
        {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`flex-1 rounded-lg py-2 text-[13px] font-semibold outline-none transition-colors ${mode === m ? "bg-white text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)]" : "text-[var(--p-muted)] hover:text-[var(--p-ink)]"}`}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-[var(--p-muted)]">
        <span>Llega por</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Origen del pedido">
          {(["COUNTER", "PHONE"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={source === s} onClick={() => setSource(s)} className={`rounded-full px-3 py-1 text-xs font-medium ${source === s ? "bg-[var(--p-ink)] text-white" : "bg-black/[0.05] text-[var(--p-ink)]"}`}>
              {s === "COUNTER" ? "Mostrador" : "Teléfono"}
            </button>
          ))}
        </div>
      </div>
      {mode === "DELIVERY" && <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección de entrega (obligatoria)" aria-label="Dirección" className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm" />}

      <ul className="mt-3 flex-1 divide-y divide-[var(--p-line)] overflow-y-auto">
        {lines.length === 0 && (
          <li className="py-3">
            <p className="py-4 text-center text-sm text-[var(--p-muted)]">Toca un producto para empezar un pedido.</p>
            {/* Entre pedido y pedido: lo recaudado hoy, sin tener que buscarlo. */}
            {hoy && (
              <button type="button" onClick={() => setHoyOpen(true)} className="p-press mt-2 w-full rounded-2xl bg-[var(--p-bg)] p-4 text-left">
                <p className="text-xs uppercase tracking-wide text-[var(--p-muted)]">Recaudado hoy</p>
                <p className="text-3xl font-semibold tabular-nums tracking-tight">{euros(hoy.totalCents - hoy.pendingCents)}</p>
                <p className="mt-0.5 text-xs text-[var(--p-muted)]">
                  {hoy.sales} {hoy.sales === 1 ? "pedido" : "pedidos"}
                  {hoy.pendingCents > 0 && ` · ${euros(hoy.pendingCents)} pendiente de cobrar`}
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {(Object.keys(HOY_PAYMENT_LABEL) as HoyPayment[])
                    .filter((k) => hoy.byPayment[k] > 0)
                    .map((k) => (
                      <li key={k} className="rounded-full bg-[var(--p-surface)] px-2.5 py-1 text-xs font-medium">
                        {HOY_PAYMENT_LABEL[k]} <span className="tabular-nums">{euros(hoy.byPayment[k])}</span>
                      </li>
                    ))}
                  {hoy.sales === 0 && <li className="text-xs text-[var(--p-muted)]">Todavía no hay ventas hoy.</li>}
                </ul>
                <p className="mt-3 text-xs font-semibold text-[var(--p-brand)]">Ver el detalle ›</p>
              </button>
            )}
          </li>
        )}
        {lines.map((l) => {
          const mods = modifierLabels(l.modifiers);
          return (
            <li key={l.key} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{l.name}</p>
                {mods.length > 0 && <p className="truncate text-xs text-[var(--p-muted)]">{mods.join(" · ")}</p>}
                <p className="text-xs text-[var(--p-muted)]">
                  {euros(l.unitPriceCents)}
                  {l.quantity > 1 && ` × ${l.quantity}`}
                </p>
              </div>
              <div className="flex items-center rounded-full bg-black/[0.05]">
                <button type="button" onClick={() => setQty(l.key, l.quantity - 1)} aria-label={l.quantity === 1 ? "Quitar" : "Quitar uno"} className="p-press flex h-10 w-10 items-center justify-center rounded-full text-lg leading-none">
                  {l.quantity === 1 ? <TrashIcon /> : "−"}
                </button>
                <span className="w-6 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                <button type="button" onClick={() => setQty(l.key, l.quantity + 1)} aria-label="Añadir uno" className="p-press flex h-10 w-10 items-center justify-center rounded-full text-lg leading-none">
                  +
                </button>
              </div>
              <span className="w-16 text-right text-[15px] font-semibold tabular-nums">{euros(l.unitPriceCents * l.quantity)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 border-t border-[var(--p-line)] pt-3">
        <button type="button" onClick={() => setDetailsOpen((v) => !v)} aria-expanded={detailsOpen} className="flex w-full items-center justify-between rounded-lg py-1.5 text-left text-sm hover:bg-black/[0.03]">
          <span className={detailsSummary ? "truncate font-medium" : "text-[var(--p-muted)]"}>{detailsSummary || "＋ Cliente, cupón o nota para cocina"}</span>
          <span className="ml-2 shrink-0 text-xs text-[var(--p-muted)]">{detailsOpen ? "Ocultar" : "Editar"}</span>
        </button>
        {detailsOpen && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" aria-label="Nombre del cliente" className="min-w-0 rounded-lg px-3 py-2.5 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (suma sellos)" inputMode="tel" aria-label="Teléfono del cliente" className="min-w-0 rounded-lg px-3 py-2.5 text-sm" />
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Cupón" aria-label="Cupón" className="min-w-0 rounded-lg px-3 py-2.5 text-sm uppercase" />
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota para cocina" aria-label="Notas" className="min-w-0 rounded-lg px-3 py-2.5 text-sm" />
          </div>
        )}
        <div className="mt-3 flex items-baseline justify-between">
          <span className="text-sm text-[var(--p-muted)]">
            {count} {count === 1 ? "artículo" : "artículos"}
            {mode === "DELIVERY" && " · envío según la zona"}
          </span>
          <span className="text-2xl font-semibold tabular-nums">{euros(subtotal)}</span>
        </div>
        <button type="button" onClick={() => setStep("pay")} disabled={!lines.length} className="p-press mt-3 w-full rounded-full bg-[var(--p-brand)] py-4 text-base font-semibold text-white disabled:opacity-40">
          Cobrar {lines.length ? euros(subtotal) : ""}
        </button>
      </div>
    </div>
  );

  // ── Pantalla 2: el cobro ────────────────────────────────────────────────
  const payView = (
    <div className="flex h-full flex-col">
      <button type="button" onClick={() => setStep("order")} className="-ml-2 flex items-center gap-1 self-start rounded-full px-2 py-1 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
        ‹ Volver al pedido
      </button>
      <div className="mt-2 text-center">
        <p className="text-xs uppercase tracking-wide text-[var(--p-muted)]">Total a cobrar</p>
        <p className="text-5xl font-semibold tabular-nums tracking-tight">{euros(subtotal)}</p>
        <p className="mt-1 text-xs text-[var(--p-muted)]">
          {count} {count === 1 ? "artículo" : "artículos"} · {MODE_LABEL[mode]} · {source === "COUNTER" ? "Mostrador" : "Teléfono"}
          {mode === "DELIVERY" && " · más envío"}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Forma de pago">
        {(Object.keys(PAYMENT_LABEL) as Payment[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={payment === p} onClick={() => setPayment(p)} className={`p-press flex items-center gap-2.5 rounded-2xl border-2 px-3 py-3 text-left text-sm font-semibold outline-none transition-colors ${payment === p ? "border-[var(--p-ink)] bg-white text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "border-transparent bg-black/[0.04] text-[var(--p-muted)] hover:bg-black/[0.07] hover:text-[var(--p-ink)]"}`}>
            <PayIcon kind={p} />
            {PAYMENT_LABEL[p]}
          </button>
        ))}
      </div>

      {payment === "CASH" && (
        <div className="mt-4 flex-1">
          <div className="flex items-end justify-between">
            <label htmlFor="caja-tendered" className="text-xs uppercase tracking-wide text-[var(--p-muted)]">
              Entrega el cliente
            </label>
            {change != null && change > 0 && <span className="text-sm font-semibold text-emerald-700">Cambio {euros(change)}</span>}
            {change === 0 && <span className="text-sm font-semibold text-emerald-700">Justo</span>}
            {missing != null && <span className="text-sm font-semibold text-[var(--p-accent)]">Faltan {euros(missing)}</span>}
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <input id="caja-tendered" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/[^\d,.]/g, "").replace(".", ","))} inputMode="decimal" placeholder="0,00" aria-label="Efectivo entregado" className="min-w-0 flex-1 rounded-xl px-3 py-2 text-right text-3xl font-semibold tabular-nums" />
            <span className="text-xl text-[var(--p-muted)]">€</span>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {quickAmounts(subtotal).map((c, i) => (
              <button key={c} type="button" onClick={() => setTendered((c / 100).toFixed(2).replace(".", ","))} className="p-press shrink-0 rounded-full bg-black/[0.05] px-3.5 py-2 text-sm font-semibold tabular-nums">
                {i === 0 ? "Justo" : euros(c).replace(/,00/, "")}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5" aria-label="Teclado">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((k) => (
              <button key={k} type="button" onClick={() => keypad(k)} aria-label={k === "⌫" ? "Borrar" : k === "," ? "Coma" : k} className="p-press rounded-xl bg-[var(--p-bg)] py-3 text-xl font-medium tabular-nums">
                {k}
              </button>
            ))}
          </div>
        </div>
      )}
      {payment !== "CASH" && (
        <p className="mt-4 flex-1 text-center text-sm text-[var(--p-muted)]">
          {payment === "CARD_TERMINAL" && "Cobra en el datáfono y confirma aquí."}
          {payment === "BIZUM" && "Cuando llegue el Bizum, confirma aquí."}
          {payment === "IN_STORE" && "El pedido entra sin cobrar: se cobra cuando el cliente venga a recogerlo."}
        </p>
      )}

      <div className="mt-3">
        {mode === "DELIVERY" && !address.trim() && <p className="mb-2 text-center text-xs text-[var(--p-accent)]">Falta la dirección de entrega (en el pedido).</p>}
        {error && (
          <p className="mb-2 text-center text-sm text-[var(--p-accent)]" role="alert">
            {error}
          </p>
        )}
        <button type="button" onClick={submit} disabled={!canConfirm} className="p-press w-full rounded-full bg-[var(--p-brand)] py-4 text-base font-semibold text-white disabled:opacity-40">
          {sending ? "Enviando…" : payment === "IN_STORE" ? "Enviar a cocina sin cobrar" : `Confirmar ${euros(subtotal)} y enviar a cocina`}
        </button>
      </div>
    </div>
  );

  // ── Pantalla 3: hecho ───────────────────────────────────────────────────
  const doneView = done && (
    <div className="flex h-full flex-col items-center justify-center text-center" role="status">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
      <p className="mt-4 text-sm text-[var(--p-muted)]">Enviado a cocina</p>
      <p className="text-3xl font-semibold">Pedido nº {done.orderNumber}</p>
      {done.changeCents != null && done.changeCents > 0 ? (
        <div className="mt-6 w-full rounded-2xl bg-emerald-50 px-4 py-5 text-emerald-800">
          <p className="text-xs uppercase tracking-wide">Devuelve al cliente</p>
          <p className="text-5xl font-semibold tabular-nums tracking-tight">{euros(done.changeCents)}</p>
        </div>
      ) : (
        <p className="mt-6 text-lg font-semibold tabular-nums">{euros(done.totalCents)}</p>
      )}
      <p className="mt-2 text-sm text-[var(--p-muted)]">
        {done.payment === "IN_STORE" ? "Pendiente de cobrar al recoger" : `Pagado · ${PAYMENT_LABEL[done.payment].toLowerCase()}`} · {euros(done.totalCents)}
      </p>
      <button type="button" onClick={newOrder} className="p-press mt-8 w-full rounded-full bg-[var(--p-brand)] py-4 text-base font-semibold text-white">
        Nuevo pedido
      </button>
    </div>
  );

  const ticket = step === "done" && done ? doneView : step === "pay" ? payView : orderView;
  const mobileSheet = sheetOpen || step === "done";

  return (
    <div className="-mx-4 -mt-20 flex min-h-screen flex-col lg:-mx-10 lg:-mt-10 lg:h-[calc(100vh-0px)] lg:flex-row" style={STORE_VARS}>
      {/* Carta */}
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-20 pb-28 lg:px-8 lg:pt-8 lg:pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
          <div className="relative order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-auto sm:max-w-sm">
            <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--p-muted)]">
              <SearchIcon />
            </span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto" className="w-full rounded-full py-2.5 pl-9 pr-3 text-sm" />
          </div>
          <button type="button" onClick={() => setHoyOpen(true)} className="p-press ml-auto flex items-center gap-2 sm:ml-0 rounded-full bg-[var(--p-surface)] px-4 py-2.5 text-sm font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <span className="text-[var(--p-muted)]">Hoy</span>
            {hoy ? (
              <>
                <span>
                  {hoy.sales} {hoy.sales === 1 ? "venta" : "ventas"}
                </span>
                <span className="tabular-nums">{euros(hoy.totalCents)}</span>
              </>
            ) : (
              <span className="text-[var(--p-muted)]">…</span>
            )}
          </button>
        </div>
        {error && !lines.length && step === "order" && <p className="mt-3 text-sm text-[var(--p-accent)]">{error}</p>}
        {categories && !q && (
          <nav className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0" style={{ scrollbarWidth: "none" }}>
            {categories.map((c) => (
              <button key={c.id} type="button" onClick={() => setCat(c.slug)} className={`p-press shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${c.slug === cat ? "bg-[var(--p-ink)] text-white" : "bg-[var(--p-surface)] text-[var(--p-ink)]"}`}>
                {c.name}
              </button>
            ))}
          </nav>
        )}
        {!categories ? (
          <p className="py-10 text-center text-sm text-[var(--p-muted)]">Cargando la carta…</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {shown.map((p) => {
              const inOrder = lines.filter((l) => l.productId === p.id).reduce((a, l) => a + l.quantity, 0);
              const hasOptions = p.isCombo || p.modifierGroups.length > 0;
              return (
                <button key={p.id} type="button" onClick={() => tap(p)} className={`p-press relative flex min-h-[112px] flex-col overflow-hidden rounded-2xl bg-[var(--p-surface)] text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] ring-2 ${inOrder ? "ring-[var(--p-brand)]" : "ring-transparent"}`}>
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="h-20 w-full object-cover" />
                  ) : (
                    <div className="h-2 w-full bg-[var(--p-brand)]/20" />
                  )}
                  <div className="flex flex-1 flex-col justify-between p-3">
                    <span className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</span>
                    <span className="mt-1.5 flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                      {euros(p.basePriceCents)}
                      {hasOptions && <span className="text-[11px] font-normal text-[var(--p-muted)]">{p.isCombo ? "menú" : "opciones"}</span>}
                    </span>
                  </div>
                  {inOrder > 0 && <span className="absolute right-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--p-brand)] px-2 text-xs font-bold text-white shadow">{inOrder}</span>}
                </button>
              );
            })}
            {shown.length === 0 && <p className="col-span-full py-8 text-center text-sm text-[var(--p-muted)]">{q ? `Nada con «${query.trim()}».` : "Esta categoría está vacía."}</p>}
          </div>
        )}
      </div>

      {/* Ticket: columna en ordenador, hoja desde abajo en el móvil */}
      <aside className="hidden w-[400px] shrink-0 border-l border-[var(--p-line)] bg-[var(--p-surface)] p-5 lg:block">{ticket}</aside>
      {portal &&
        createPortal(
          <div style={STORE_VARS}>
            <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
              {mobileSheet ? (
                <div className="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label="Pedido">
                  <button type="button" aria-label="Cerrar" onClick={() => (step === "done" ? newOrder() : setSheetOpen(false))} className="absolute inset-0 bg-black/40" />
                  <div className="relative flex max-h-[92vh] min-h-[60vh] w-full flex-col overflow-y-auto rounded-t-[24px] bg-[var(--p-surface)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[var(--p-ink)]">
                    <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15" />
                    <div className="flex-1">{ticket}</div>
                  </div>
                </div>
              ) : (
                lines.length ? (
                  <button type="button" onClick={() => setSheetOpen(true)} className="p-press mx-4 mb-4 flex w-[calc(100%-32px)] items-center justify-between rounded-full bg-[var(--p-brand)] px-5 py-4 text-base font-semibold text-white shadow-lg">
                    <span>Ver pedido · {count}</span>
                    <span className="tabular-nums">{euros(subtotal)}</span>
                  </button>
                ) : (
                  // Sin pedido: la barra enseña lo recaudado hoy y abre el detalle.
                  <button type="button" onClick={() => setHoyOpen(true)} className="p-press mx-4 mb-4 flex w-[calc(100%-32px)] items-center justify-between rounded-full bg-[var(--p-surface)] px-5 py-4 text-base font-semibold text-[var(--p-ink)] shadow-lg ring-1 ring-[var(--p-line)]">
                    <span>
                      Recaudado hoy
                      {hoy && hoy.sales > 0 && <span className="ml-1.5 text-sm font-medium text-[var(--p-muted)]">· {hoy.sales} {hoy.sales === 1 ? "pedido" : "pedidos"}</span>}
                    </span>
                    <span className="tabular-nums">{hoy ? euros(hoy.totalCents - hoy.pendingCents) : "…"}</span>
                  </button>
                )
              )}
            </div>
            {hoyOpen && (
              <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-label="Hoy en caja">
                <button type="button" aria-label="Cerrar" onClick={() => setHoyOpen(false)} className="absolute inset-0 bg-black/40" />
                <div className="relative flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-[24px] bg-[var(--p-surface)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] text-[var(--p-ink)] lg:max-w-xl lg:rounded-[24px] lg:p-6">
                  <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15 lg:hidden" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">Hoy en caja</h2>
                      <p className="text-xs text-[var(--p-muted)]">{hoy && hoy.day.charAt(0).toUpperCase() + hoy.day.slice(1)}</p>
                    </div>
                    <button type="button" onClick={() => setHoyOpen(false)} className="rounded-full px-3 py-1 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
                      Cerrar
                    </button>
                  </div>
                  {!hoy ? (
                    <p className="py-8 text-center text-sm text-[var(--p-muted)]">Cargando…</p>
                  ) : (
                    <>
                      <div className="mt-4 rounded-2xl bg-[var(--p-bg)] p-4">
                        <p className="text-xs uppercase tracking-wide text-[var(--p-muted)]">Ventas de hoy</p>
                        <p className="text-4xl font-semibold tabular-nums tracking-tight">{euros(hoy.totalCents)}</p>
                        <p className="mt-1 text-sm text-[var(--p-muted)]">
                          {hoy.sales} {hoy.sales === 1 ? "pedido" : "pedidos"}
                          {hoy.cancelled > 0 && ` · ${hoy.cancelled} ${hoy.cancelled === 1 ? "cancelado" : "cancelados"}`}
                        </p>
                      </div>
                      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {(Object.keys(HOY_PAYMENT_LABEL) as HoyPayment[])
                          .filter((k) => hoy.byPayment[k] > 0)
                          .map((k) => (
                            <li key={k} className="rounded-xl bg-black/[0.04] px-3 py-2.5">
                              <p className="text-xs text-[var(--p-muted)]">{HOY_PAYMENT_LABEL[k]}</p>
                              <p className="text-lg font-semibold tabular-nums">{euros(hoy.byPayment[k])}</p>
                            </li>
                          ))}
                        {hoy.pendingCents > 0 && (
                          <li className="rounded-xl bg-amber-50 px-3 py-2.5 text-amber-900">
                            <p className="text-xs">Pendiente de cobrar</p>
                            <p className="text-lg font-semibold tabular-nums">{euros(hoy.pendingCents)}</p>
                          </li>
                        )}
                        {hoy.refundedCents > 0 && (
                          <li className="rounded-xl bg-black/[0.04] px-3 py-2.5">
                            <p className="text-xs text-[var(--p-muted)]">Devuelto</p>
                            <p className="text-lg font-semibold tabular-nums">{euros(hoy.refundedCents)}</p>
                          </li>
                        )}
                      </ul>
                      <p className="mt-2 text-xs text-[var(--p-muted)]">El efectivo que debe haber en el cajón es la venta en efectivo más el fondo con el que abriste.</p>
                      <ul className="mt-4 divide-y divide-[var(--p-line)]">
                        {hoy.orders.length === 0 && <li className="py-8 text-center text-sm text-[var(--p-muted)]">Todavía no hay pedidos hoy.</li>}
                        {hoy.orders.map((o) => (
                          <li key={o.id} className={`flex items-center gap-3 py-2.5 ${o.status === "CANCELLED" ? "opacity-50" : ""}`}>
                            <span className="w-12 shrink-0 text-xs tabular-nums text-[var(--p-muted)]">{hourOf(o.createdAt)}</span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                #{o.orderNumber} {o.customerName}
                              </p>
                              <p className="truncate text-xs text-[var(--p-muted)]">
                                {o.source === "ONLINE" ? "Online" : o.source === "PHONE" ? "Teléfono" : "Mostrador"} · {o.channel === "DELIVERY" ? "a domicilio" : o.dineIn ? "comer aquí" : "para llevar"} · {o.status === "CANCELLED" ? "cancelado" : o.paid ? HOY_PAYMENT_LABEL[o.paymentMethod].toLowerCase() : "sin cobrar"}
                                {o.status !== "CANCELLED" && ` · ${STATUS_LABEL[o.status] ?? o.status}`}
                              </p>
                            </div>
                            <span className={`text-sm font-semibold tabular-nums ${o.status === "CANCELLED" ? "line-through" : ""}`}>{euros(o.totalCents)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}
function PayIcon({ kind }: { kind: Payment }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "CASH")
    return (
      <svg {...common}>
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 12h.01M18 12h.01" />
      </svg>
    );
  if (kind === "CARD_TERMINAL")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M7 15h4" />
      </svg>
    );
  if (kind === "BIZUM")
    return (
      <svg {...common}>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
