/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { ask } from "@/app/lib/dialog";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/store/cart";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";
import { themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import { formatModifier } from "@/app/lib/menuOptions";
import { couponDiscount } from "@/app/lib/retention";
import { bestDiscount, collaboratorDiscountCents } from "@/app/lib/collaboratorDiscount";
import { captureCollabFromUrl, checkCollab, saveCollab, type Collab } from "../collab";
import type { PublicStoreInfo } from "@/app/lib/storeOps";
import { normalizePostalCode, zoneForPostalCode } from "@/app/lib/storeStatus";
import type { PublicPerks } from "@/app/lib/perks";
import DeliveryPartners, { type PartnerLink } from "../DeliveryPartners";
import AddressInput from "./AddressInput";
import TimePicker from "./TimePicker";
import { DEFAULT_CHECKOUT, type CheckoutSettings } from "@/app/lib/storePolicies";
import { slotDay, storeMessage, ui, whenText, type Lang } from "@/app/lib/i18n";
import StampCard from "../StampCard";
import { bestPromotion, joinLabels, rewardDiscount } from "@/app/lib/promotions";

type PerkState = { proven: boolean; firstOrder: boolean | null; loyalty: { stamps: number; needed: number; rewardAvailable: boolean } | null };

type AppliedCoupon = { code: string; label: string; type: "PERCENT" | "FIXED"; value: number; minOrderCents: number };

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

// Valida un teléfono español: 9 dígitos que empiezan en 6/7/8/9,
// aceptando prefijo +34 / 0034 y espacios o guiones.
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function isValidSpanishPhone(raw: string): boolean {
  const cleaned = raw.replace(/[\s-]/g, "");
  return /^(?:\+34|0034)?[6789]\d{8}$/.test(cleaned);
}

type CheckoutClientProps = {
  tenant: string;
  theme?: TenantTheme;
  settings?: StoreSettings;
  couponsEnabled?: boolean;
  store?: PublicStoreInfo | null;
  perks?: PublicPerks;
  productInfo?: Record<string, { categoryId: string; basePriceCents: number }>;
  deliveryPartners?: PartnerLink[];
  lang?: Lang;
  payment?: { card: boolean; bizum: boolean; inStore: boolean; test: boolean };
  storeId?: string | null; // sucursales: local elegido en la carta
  storeName?: string | null; // solo si hay más de un local
  checkout?: CheckoutSettings; // Configuración → Pantalla de pago
  giftCardsEnabled?: boolean; // el restaurante tiene tarjetas regalo
};

type PayMethod = "CARD" | "BIZUM" | "IN_STORE";

// Pago con Redsys: se envía un formulario firmado a la página del banco.
function submitPaymentForm(action: string, fields: Record<string, string>) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export default function CheckoutClient({ tenant, theme, settings, store, couponsEnabled = false, perks, productInfo = {}, deliveryPartners = [], lang = "es", payment = { card: false, bizum: false, inStore: true, test: false }, storeId = null, storeName = null, checkout = DEFAULT_CHECKOUT, giftCardsEnabled = false }: CheckoutClientProps) {
  const T = ui(lang);
  const router = useRouter();
  const { items, subtotalCents, clear, inc, dec } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"TAKEAWAY" | "DELIVERY">("TAKEAWAY");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  // Por defecto, la tarjeta si el restaurante la tiene (como las grandes cadenas).
  const [payMethod, setPayMethod] = useState<PayMethod>(payment.card ? "CARD" : "IN_STORE");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tipPct, setTipPct] = useState(0);
  const [giftInput, setGiftInput] = useState("");
  const [gift, setGift] = useState<{ code: string; balanceCents: number } | null>(null);
  const [giftError, setGiftError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  // Cupón y tarjeta regalo plegados salvo que ya haya uno aplicado o un error que enseñar.
  const showExtras = extrasOpen || !!coupon || !!gift || !!couponError || !!giftError;
  const [couponLoading, setCouponLoading] = useState(false);
  // Colaborador (RRPP, hotel…): del enlace ?c= o escrito en el campo de código.
  const [collab, setCollab] = useState<Collab | null>(null);
  useEffect(() => {
    let alive = true;
    void captureCollabFromUrl(tenant).then((c) => alive && setCollab(c));
    return () => {
      alive = false;
    };
  }, [tenant]);
  const [perkState, setPerkState] = useState<PerkState | null>(null);
  // Sin reparto propio: "A domicilio" muestra las plataformas en vez de un formulario.
  const [showPartners, setShowPartners] = useState(false);
  const takeawayOn = channel === "TAKEAWAY" && !showPartners;
  const hasPerks = !!perks && (perks.promotions.length > 0 || !!perks.loyalty);

  // Con un teléfono válido, el servidor dice si es su primer pedido y cuántos sellos lleva.
  const phoneOk = isValidSpanishPhone(phone);
  useEffect(() => {
    if (!hasPerks || !phoneOk) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/perks/${tenant}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => !cancelled && setPerkState(d as PerkState | null))
        .catch(() => {});
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tenant, phone, phoneOk, hasPerks]);
  const perksFor = phoneOk ? perkState : null;

  // Theme dinámico del tenant
  const t = theme ?? SYSTEM_DEFAULT_THEME;
  const cssVars = themeToCssVars(t);

  // Costes desde settings del tenant
  const deliveryFee = settings?.deliveryFeeCents ?? 200;
  const deliveryEnabled = settings?.deliveryEnabled ?? true;
  const takeawayEnabled = settings?.takeawayEnabled ?? true;

  const subtotal = subtotalCents();
  // Zonas de reparto: el código postal decide el envío y el pedido mínimo.
  const zones = store?.zones ?? [];
  const cp = normalizePostalCode(postalCode);
  const zone = channel === "DELIVERY" && zones.length && cp.length === 5 ? zoneForPostalCode(zones, cp) : null;
  const outOfZone = channel === "DELIVERY" && zones.length > 0 && cp.length === 5 && !zone;
  const zoneFee = zone ? zone.feeCents : deliveryFee;
  const minimum = channel !== "DELIVERY" ? 0 : zone ? zone.minOrderCents : zones.length ? 0 : settings?.minimumOrderCents ?? 0;
  const belowMinimum = channel === "DELIVERY" && minimum > 0 && subtotal < minimum;
  const closed = store ? !store.status.open : false;
  // ¿Cuándo? Lo antes posible o programado (obligatorio si ahora está cerrado).
  // Sin «programar» (Pantalla de pago), no se ofrecen horas.
  const slots = (checkout.scheduling ? store?.slots?.[channel] ?? [] : []) as { at: string; day: string; time: string }[];
  const [wantSchedule, setWantSchedule] = useState(false);
  const [slotAt, setSlotAt] = useState("");
  const scheduling = closed || wantSchedule;
  const chosenSlot = scheduling ? slots.find((sl) => sl.at === slotAt) ?? slots[0] ?? null : null;
  const blocked = scheduling && !chosenSlot;
  const fee = channel === "DELIVERY" ? zoneFee : 0;
  // Mismo orden que el servidor: 1) premio de la tarjeta, 2) la mejor promoción
  // o el cupón (no se acumulan). El importe final lo recalcula el servidor.
  const reward =
    perks?.loyalty && perksFor?.loyalty?.rewardAvailable
      ? rewardDiscount(
          perks.loyalty,
          items.map((i) => ({ key: i.id, categoryId: productInfo[i.productId]?.categoryId ?? null, unitBaseCents: productInfo[i.productId]?.basePriceCents ?? 0, quantity: i.quantity }))
        )
      : null;
  const loyaltyDiscount = reward?.discountCents ?? 0;
  const afterLoyalty = subtotal - loyaltyDiscount;
  const promo = perks ? bestPromotion(perks.promotions, { subtotalCents: afterLoyalty, feesCents: fee, channel, firstOrder: perksFor ? perksFor.firstOrder : null }) : null;
  // El descuento se recalcula al cambiar cantidades; bajo el mínimo no se aplica.
  const couponBelowMin = coupon ? subtotal < coupon.minOrderCents : false;
  const couponAmount = coupon && !couponBelowMin ? couponDiscount(coupon, afterLoyalty) : 0;
  // Promoción, cupón y descuento del colaborador no se acumulan: gana el que más ahorra.
  const collabOffer = collab ? collaboratorDiscountCents(afterLoyalty, collab.discountPct ?? 0) : 0;
  const winner = bestDiscount(promo?.discountCents ?? 0, couponAmount, collabOffer);
  const promoWins = winner === "promo" && !!promo;
  const discount = winner === "coupon" ? couponAmount : 0;
  const promoDiscount = promoWins ? promo.discountCents : 0;
  const collabDiscount = winner === "collab" ? collabOffer : 0;
  // Propina sobre la comida (sin envío) y tarjeta regalo al final.
  const tip = tipPct ? Math.round((Math.max(subtotal - loyaltyDiscount - promoDiscount - discount - collabDiscount, 0) * tipPct) / 100) : 0;
  const beforeGift = Math.max(subtotal + fee - loyaltyDiscount - promoDiscount - discount - collabDiscount, 0) + tip;
  const giftUsed = gift ? Math.min(gift.balanceCents, beforeGift) : 0;
  const total = beforeGift - giftUsed;

  async function applyGift() {
    const code = giftInput.trim();
    if (!code) return;
    setGiftError("");
    try {
      const res = await fetch(`/api/giftcards/${tenant}?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) {
        setGift(null);
        setGiftError(data.error ?? T.giftCardError);
        return;
      }
      setGift(data);
      setGiftInput("");
    } catch {
      setGiftError(T.networkError);
    }
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      // Sin cupones, o si no es un cupón: puede ser el código de un colaborador.
      const asCollab = async () => {
        const c = await checkCollab(tenant, code);
        if (!c) return false;
        saveCollab(tenant, c);
        setCollab(c);
        setCouponInput("");
        return true;
      };
      if (!couponsEnabled) {
        if (!(await asCollab())) setCouponError(T.codeNotFound);
        return;
      }
      const res = await fetch(`/api/coupons/${tenant}?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 && (await asCollab())) return;
        setCoupon(null);
        setCouponError(data.error ?? T.couponError);
        return;
      }
      setCoupon(data as AppliedCoupon);
      setCouponInput("");
    } catch {
      setCouponError(T.networkError);
    } finally {
      setCouponLoading(false);
    }
  }
  const count = items.reduce((a, i) => a + i.quantity, 0);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "13px 16px",
    borderRadius: "12px",
    border: `1px solid ${cssVars["--border"]}`,
    backgroundColor: cssVars["--surface-1"],
    color: cssVars["--text-primary"],
    fontSize: "15px",
    outline: "none",
    fontFamily: cssVars["--font-body"],
    boxSizing: "border-box",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "13px",
    fontWeight: 500,
    color: cssVars["--text-secondary"],
    marginBottom: "6px",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validación de teléfono antes de enviar: protege la calidad del CRM.
    if (!isValidSpanishPhone(phone)) {
      setError(T.invalidPhone);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${tenant}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerPhone: phone,
          customerAddress: channel === "DELIVERY" ? address : undefined,
          customerPostalCode: channel === "DELIVERY" && cp ? cp : undefined,
          channel,
          notes: notes || undefined,
          marketingConsent,
          couponCode: coupon && !couponBelowMin ? coupon.code : undefined,
          scheduledFor: chosenSlot?.at,
          paymentMethod: payMethod,
          lang,
          storeId: storeId ?? undefined,
          tipPercent: tipPct || undefined,
          giftCardCode: gift?.code,
          collaboratorCode: collab?.code,
          // Solo qué se pide: el servidor pone nombres y precios desde la carta.
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            optionIds: item.optionIds,
            ...(item.comboChoices && { comboChoices: item.comboChoices }),
          })),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? T.orderError);
        return;
      }
      const data = await res.json();
      // Pago online: a la pasarela del restaurante. El carrito se vacía al confirmarse el pago.
      if (data.payment?.kind === "redirect") {
        window.location.assign(data.payment.url);
        return;
      }
      if (data.payment?.kind === "form") {
        submitPaymentForm(data.payment.action, data.payment.fields);
        return;
      }
      clear();
      router.push(`/pedir/${tenant}/confirmacion/${data.orderId}`);
    } catch {
      setError(T.networkError);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px", ...(cssVars as any) }}>
        <div style={{ fontSize: "48px" }}>🛒</div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: cssVars["--text-primary"] }}>{T.emptyCart}</div>
        <a href={`/pedir/${tenant}`} style={{ padding: "13px 28px", borderRadius: "999px", backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
          {T.backToMenu}
        </a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], fontFamily: cssVars["--font-body"], ...(cssVars as any) }}>

      {/* HEADER */}
      <header className="p-glass" style={{ position: "sticky", top: 0, zIndex: 50, ["--p-surface" as any]: cssVars["--surface-0"], borderBottom: `1px solid ${cssVars["--border"]}`, height: "56px", display: "flex", alignItems: "center", padding: "0 20px", gap: "14px" }}>
        <a href={`/pedir/${tenant}`} aria-label={T.backToMenu} className="p-press" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "44px", height: "44px", marginLeft: "-10px", borderRadius: "999px", color: cssVars["--brand-accent"], fontSize: "24px", textDecoration: "none", lineHeight: "1" }}>←</a>
        <span style={{ fontWeight: 600, fontSize: "16px" }}>{T.confirmOrder}</span>
        {storeName && <span className="ml-auto truncate text-[13px]" style={{ color: cssVars["--text-secondary"] }}>📍 {storeName}</span>}
      </header>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 16px 120px" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* RESUMEN DEL PEDIDO */}
          <div style={{ backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)", borderRadius: "18px", padding: "20px" }}>
            <div style={{ fontSize: "13px", fontWeight: 500, color: cssVars["--text-secondary"], marginBottom: "14px" }}>
              {T.yourOrder(count)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: cssVars["--text-primary"] }}>{item.name}</div>
                    {item.modifiers.length > 0 && (
                      <div style={{ fontSize: "12px", color: cssVars["--text-secondary"], marginTop: "2px", lineHeight: 1.4 }}>
                        {item.modifiers.map((m) => formatModifier(m, lang)).join(" · ")}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                      <button type="button" aria-label={T.removeOne(item.name)} onClick={() => dec(item.id)} className="p-press" style={{ width: "40px", height: "40px", borderRadius: "50%", border: `2px solid ${cssVars["--brand-accent"]}`, backgroundColor: "transparent", color: cssVars["--brand-accent"], fontWeight: 700, fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>−</button>
                      <span style={{ fontWeight: 700, fontSize: "16px", minWidth: "20px", textAlign: "center" }}>{item.quantity}</span>
                      <button type="button" aria-label={T.addAnother(item.name)} onClick={() => inc(item.id)} className="p-press" style={{ width: "40px", height: "40px", borderRadius: "50%", border: "none", backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)", fontWeight: 700, fontSize: "18px", cursor: "pointer", lineHeight: 1 }}>+</button>
                    </div>
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: cssVars["--text-primary"], flexShrink: 0 }}>
                    {euros(item.unitPriceCents * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
              <a href={`/pedir/${tenant}`} className="p-press" style={{ display: "inline-flex", alignItems: "center", minHeight: "44px", color: cssVars["--brand-accent"], fontWeight: 600, fontSize: "14px", textDecoration: "none" }}>
                + {T.addMore}
              </a>
              <button type="button" onClick={async () => (await ask(T.confirmClear, { confirm: T.clearOrder, cancel: lang === "en" ? "Cancel" : "Cancelar", danger: true })) && clear()} className="p-press" style={{ minHeight: "44px", padding: "0 4px", background: "none", border: "none", color: cssVars["--text-secondary"], fontSize: "13px", cursor: "pointer" }}>
                {T.clearOrder}
              </button>
            </div>

            {/* TOTALES */}
            <div style={{ borderTop: `1px solid ${cssVars["--border"]}`, marginTop: "16px", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                <span>{T.subtotal}</span>
                <span>{euros(subtotal)}</span>
              </div>
              {loyaltyDiscount > 0 && reward && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>
                  <span>{T.rewardLine(joinLabels(reward.matched).toLowerCase())}</span>
                  <span>−{euros(loyaltyDiscount)}</span>
                </div>
              )}
              {promoDiscount > 0 && promo && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>
                  <span>🏷️ {promo.promotion.name}</span>
                  <span>−{euros(promoDiscount)}</span>
                </div>
              )}
              {collabDiscount > 0 && collab && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>
                  <span>{T.collabDiscountLine(collab.name, (collab.discountPct ?? 0).toLocaleString("es-ES"))}</span>
                  <span>−{euros(collabDiscount)}</span>
                </div>
              )}
              {discount > 0 && coupon && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>
                  <span>Cupón {coupon.code} ({coupon.label})</span>
                  <span>−{euros(discount)}</span>
                </div>
              )}
              {channel === "DELIVERY" && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                  <span>{T.deliveryFee}</span>
                  <span>{zones.length && !zone ? T.byPostalCode : fee === 0 ? T.free : euros(fee)}</span>
                </div>
              )}
              {tip > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                  <span>{T.tip} ({tipPct} %)</span>
                  <span>{euros(tip)}</span>
                </div>
              )}
              {giftUsed > 0 && gift && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>
                  <span>🎁 {T.giftCard} {gift.code}</span>
                  <span>−{euros(giftUsed)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700, color: cssVars["--text-primary"] }}>
                <span>{T.total}</span>
                <span style={{ color: cssVars["--brand-accent"] }}>{euros(total)}</span>
              </div>
            </div>
          </div>

          {/* MODALIDAD */}
          {(deliveryEnabled || takeawayEnabled || deliveryPartners.length > 0) && (
            <div>
              <div style={labelStyle}>{T.mode}</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {takeawayEnabled && (
                  <button
                    type="button"
                    onClick={() => { setChannel("TAKEAWAY"); setShowPartners(false); }}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${takeawayOn ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: takeawayOn ? `${cssVars["--brand-accent"]}15` : "transparent", color: takeawayOn ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: takeawayOn ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    {T.pickup}
                  </button>
                )}
                {deliveryEnabled && (
                  <button
                    type="button"
                    onClick={() => setChannel("DELIVERY")}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${channel === "DELIVERY" ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: channel === "DELIVERY" ? `${cssVars["--brand-accent"]}15` : "transparent", color: channel === "DELIVERY" ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: channel === "DELIVERY" ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    {T.deliveryBtn}
                  </button>
                )}
                {!deliveryEnabled && deliveryPartners.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPartners(!showPartners)}
                    aria-expanded={showPartners}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${showPartners ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: showPartners ? `${cssVars["--brand-accent"]}15` : "transparent", color: showPartners ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: showPartners ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    {T.homeBtn}
                  </button>
                )}
              </div>
              {showPartners && !deliveryEnabled && (
                <div style={{ marginTop: "12px", padding: "14px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>{T.chooseCourier}</div>
                  <div style={{ fontSize: "12px", color: cssVars["--text-secondary"], marginBottom: "10px" }}>
                    {T.courierNote}
                  </div>
                  <DeliveryPartners partners={deliveryPartners} compact />
                </div>
              )}
            </div>
          )}

          {/* ¿CUÁNDO? — lo antes posible o programado */}
          {(slots.length > 0 || closed) && (
            <div>
              <div style={labelStyle}>{T.when}</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {!closed && (
                  <button type="button" onClick={() => setWantSchedule(false)} aria-pressed={!scheduling}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${!scheduling ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: !scheduling ? `${cssVars["--brand-accent"]}15` : "transparent", color: !scheduling ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: !scheduling ? 700 : 400, fontSize: "14px", cursor: "pointer" }}>
                    {T.asap}
                    <span style={{ display: "block", fontSize: "12px", fontWeight: 400 }}>{T.aboutMin(channel === "DELIVERY" ? settings?.estimatedDeliveryMinutes ?? 45 : settings?.estimatedPickupMinutes ?? 20)}</span>
                  </button>
                )}
                {slots.length > 0 && (
                  <button type="button" onClick={() => setWantSchedule(true)} aria-pressed={scheduling}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${scheduling ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: scheduling ? `${cssVars["--brand-accent"]}15` : "transparent", color: scheduling ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: scheduling ? 700 : 400, fontSize: "14px", cursor: "pointer" }}>
                    {T.schedule}
                    <span style={{ display: "block", fontSize: "12px", fontWeight: 400 }}>{chosenSlot ? `${slotDay(chosenSlot.day, lang)}, ${chosenSlot.time}` : T.pickDayTime}</span>
                  </button>
                )}
              </div>
              {scheduling && slots.length > 0 && (
                <div style={{ marginTop: "12px", padding: "14px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  {/* Campo con la hora; al tocarlo se abre la hoja con la rueda hora · minutos (como «Editar alarma» del iPhone) */}
                  <div style={{ ...labelStyle, marginBottom: "8px" }}>{channel === "DELIVERY" ? T.deliveryTime : T.pickupTime}</div>
                  <TimePicker slots={slots} value={chosenSlot?.at ?? null} onChange={setSlotAt} lang={lang} title={channel === "DELIVERY" ? T.deliveryTime : T.pickupTime} />
                </div>
              )}
              {closed && slots.length === 0 && (
                <div style={{ marginTop: "8px", fontSize: "13px", color: cssVars["--text-secondary"] }}>{T.noSlots}</div>
              )}
            </div>
          )}

          {/* DATOS DE CONTACTO */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={labelStyle}>{T.name}</label>
              <input
                style={inputStyle}
                type="text"
                placeholder={T.yourName}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{T.phone}</label>
              <input
                style={inputStyle}
                type="tel"
                placeholder="6XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            {channel === "DELIVERY" && (
              <div>
                <label style={labelStyle}>{T.address}</label>
                <AddressInput
                  lang={lang}
                  tenant={tenant}
                  value={address}
                  onChange={setAddress}
                  onPick={(sug) => {
                    setAddress(sug.street);
                    if (sug.postalCode) setPostalCode(sug.postalCode);
                  }}
                  inputStyle={inputStyle}
                />
                <div style={{ fontSize: "12px", color: cssVars["--text-secondary"], marginTop: "4px" }}>{T.floorInNotes}</div>
              </div>
            )}
            {channel === "DELIVERY" && zones.length > 0 && (
              <div>
                <label style={labelStyle}>{T.postalCode}</label>
                <input
                  style={{ ...inputStyle, maxWidth: "160px" }}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="18004"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  required
                />
                {zone && (
                  <div style={{ fontSize: "13px", color: cssVars["--text-secondary"], marginTop: "6px" }}>
                    {T.weDeliverIn(zone.name, zone.feeCents === 0 ? T.free.toLowerCase() : euros(zone.feeCents), zone.minOrderCents > 0 ? euros(zone.minOrderCents) : null)}
                  </div>
                )}
                {outOfZone && (
                  <div style={{ fontSize: "13px", color: cssVars["--brand-secondary"], marginTop: "6px", fontWeight: 600 }}>
                    {T.notDelivering(cp)}
                  </div>
                )}
              </div>
            )}
            {checkout.notes && (
              <div>
                <label style={labelStyle}>{T.notes}</label>
                <textarea
                  style={{ ...inputStyle, minHeight: "80px", resize: "vertical" } as React.CSSProperties}
                  placeholder={T.notesPlaceholder}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* CÓMO PAGAS: solo si hay más de una opción */}
          {[payment.card, payment.bizum, payment.inStore].filter(Boolean).length > 1 && (
            <div>
              <div style={{ fontSize: "13px", fontWeight: 500, color: cssVars["--text-secondary"], marginBottom: "10px" }}>{T.howToPay}</div>
              <div role="radiogroup" aria-label={T.howToPay} className="grid gap-2 sm:grid-cols-3">
                {([
                  payment.card && { key: "CARD" as const, title: `💳 ${T.payCard}`, hint: T.payCardHint },
                  payment.bizum && { key: "BIZUM" as const, title: `📱 ${T.payBizum}`, hint: "" },
                  payment.inStore && { key: "IN_STORE" as const, title: `💶 ${channel === "DELIVERY" ? T.payOnDelivery : T.payAtPickup}`, hint: T.payInPerson },
                ].filter(Boolean) as { key: PayMethod; title: string; hint: string }[]).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={payMethod === m.key}
                    onClick={() => setPayMethod(m.key)}
                    className="p-press rounded-2xl px-4 py-3 text-left"
                    style={{ border: `2px solid ${payMethod === m.key ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: cssVars["--surface-1"] }}
                  >
                    <span className="block text-[15px] font-semibold">{m.title}</span>
                    {m.hint && <span className="mt-0.5 block text-xs" style={{ color: cssVars["--text-secondary"] }}>{m.hint}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PROPINA (si el restaurante la activa) */}
          {checkout.tips.enabled && (
            <div>
              <div style={labelStyle}>{T.tipTitle}</div>
              <div role="radiogroup" aria-label={T.tipTitle} style={{ display: "grid", gridTemplateColumns: `repeat(${checkout.tips.percents.length + 1}, minmax(0, 1fr))`, gap: "6px" }}>
                {[0, ...checkout.tips.percents].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    role="radio"
                    aria-checked={tipPct === pct}
                    onClick={() => setTipPct(pct)}
                    className="p-press"
                    style={{ minHeight: "48px", padding: "6px 2px", borderRadius: "12px", border: `2px solid ${tipPct === pct ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: tipPct === pct ? `${cssVars["--brand-accent"]}15` : "transparent", color: tipPct === pct ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: tipPct === pct ? 700 : 500, fontSize: "14px", cursor: "pointer" }}
                  >
                    {pct === 0 ? T.noTip : `${pct} %`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CUPÓN Y TARJETA REGALO: plegados en un enlace (casi nadie tiene código) */}
          {/* Código de colaborador ya puesto (por su enlace o escrito) */}
          {collab && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 16px", borderRadius: "12px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
              <div style={{ minWidth: 0, fontSize: "14px" }}>
                {T.collabApplied} <span style={{ fontWeight: 700, letterSpacing: "0.04em" }}>{collab.code}</span>
                {(collab.discountPct ?? 0) > 0 && <span style={{ display: "block", fontSize: "12px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>{T.collabDiscountHint((collab.discountPct ?? 0).toLocaleString("es-ES"))}</span>}
              </div>
              <button type="button" onClick={() => { saveCollab(tenant, null); setCollab(null); }} style={{ background: "none", border: "none", color: cssVars["--text-secondary"], fontSize: "13px", cursor: "pointer", flexShrink: 0, minHeight: "44px" }}>
                {T.remove}
              </button>
            </div>
          )}

          {/* CUPÓN, CÓDIGO Y TARJETA REGALO: plegados en un enlace (casi nadie tiene código) */}
          {(couponsEnabled || giftCardsEnabled || !collab) && (
            showExtras ? (
              <>
          {/* CUPÓN (o código de colaborador) */}
          {(couponsEnabled || !collab) && (
            <div>
              <div style={labelStyle}>{couponsEnabled ? T.couponTitle : T.codeTitle}</div>
              {coupon ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 16px", borderRadius: "12px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "15px" }}>{coupon.code} · {coupon.label}</div>
                    {!couponBelowMin && promoWins && promo && (
                      <div style={{ fontSize: "12px", color: cssVars["--text-secondary"] }}>{T.couponNotStack(promo.promotion.name)}</div>
                    )}
                    {couponBelowMin && (
                      <div style={{ fontSize: "12px", color: cssVars["--text-secondary"] }}>{T.couponBelowMin(euros(coupon.minOrderCents))}</div>
                    )}
                  </div>
                  <button type="button" onClick={() => setCoupon(null)} style={{ background: "none", border: "none", color: cssVars["--text-secondary"], fontSize: "13px", cursor: "pointer", flexShrink: 0 }}>
                    {T.remove}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                    placeholder="Ej. VUELVE15"
                    autoCapitalize="characters"
                    style={{ ...inputStyle, flex: 1, minWidth: 0, textTransform: "uppercase" }}
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="p-press"
                    style={{ padding: "0 18px", borderRadius: "999px", border: `1px solid ${cssVars["--brand-accent"]}`, backgroundColor: "transparent", color: cssVars["--brand-accent"], fontWeight: 600, fontSize: "14px", cursor: "pointer", flexShrink: 0, opacity: couponLoading || !couponInput.trim() ? 0.5 : 1 }}
                  >
                    {couponLoading ? "…" : T.apply}
                  </button>
                </div>
              )}
              {couponError && <div style={{ fontSize: "13px", color: cssVars["--brand-secondary"], marginTop: "6px" }}>{couponError}</div>}
            </div>
          )}

          {/* TARJETA REGALO */}
          {giftCardsEnabled && (
            <div>
              <div style={labelStyle}>🎁 {T.giftCard}</div>
              {gift ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 16px", borderRadius: "12px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "15px" }}>{gift.code}</div>
                    <div style={{ fontSize: "12px", color: cssVars["--text-secondary"] }}>{T.giftBalance(euros(gift.balanceCents))}</div>
                  </div>
                  <button type="button" onClick={() => setGift(null)} style={{ background: "none", border: "none", color: cssVars["--text-secondary"], fontSize: "13px", cursor: "pointer", flexShrink: 0 }}>
                    {T.remove}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    value={giftInput}
                    onChange={(e) => setGiftInput(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyGift(); } }}
                    placeholder="XXXX-XXXX-XXXX"
                    autoCapitalize="characters"
                    aria-label={T.giftCard}
                    style={{ ...inputStyle, flex: 1, minWidth: 0, textTransform: "uppercase" }}
                  />
                  <button
                    type="button"
                    onClick={applyGift}
                    disabled={!giftInput.trim()}
                    className="p-press"
                    style={{ padding: "0 18px", borderRadius: "999px", border: `1px solid ${cssVars["--brand-accent"]}`, backgroundColor: "transparent", color: cssVars["--brand-accent"], fontWeight: 600, fontSize: "14px", cursor: "pointer", flexShrink: 0, opacity: giftInput.trim() ? 1 : 0.5 }}
                  >
                    {T.apply}
                  </button>
                </div>
              )}
              {giftError && <div style={{ fontSize: "13px", color: cssVars["--brand-secondary"], marginTop: "6px" }}>{giftError}</div>}
            </div>
          )}

              </>
            ) : (
              <button type="button" onClick={() => setExtrasOpen(true)} style={{ alignSelf: "flex-start", minHeight: "44px", background: "none", border: "none", padding: "0 2px", color: cssVars["--brand-accent"], fontWeight: 600, fontSize: "14px", textDecoration: "underline", textUnderlineOffset: "3px", cursor: "pointer" }}>
                {couponsEnabled && giftCardsEnabled ? T.haveCodeOrGift : couponsEnabled ? T.haveCode : giftCardsEnabled ? T.haveCodeOrGift : T.haveAnyCode}
              </button>
            )
          )}

          {checkout.marketingConsent && (
            <>
          {/* CONSENTIMIENTO DE MARKETING — opt-in explícito, desmarcado por defecto (RGPD + LSSI) */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", lineHeight: 1.45, color: cssVars["--text-secondary"], cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              style={{ marginTop: "2px", width: "18px", height: "18px", flexShrink: 0, accentColor: cssVars["--brand-accent"] }}
            />
            <span>
              {T.consent}
            </span>
          </label>
            </>
          )}

          {/* CERRADO / MÍNIMO */}
          {store && !store.status.open && (
            <div style={{ padding: "12px 16px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], color: cssVars["--brand-secondary"], fontSize: "14px", fontWeight: 600 }}>
              {storeMessage(store.status.kind, store.status.message, lang)}.{!store.status.open && store.status.reopens ? ` ${capitalize(T.closedOpens(whenText(store.status.reopens, lang)!))}.` : ""}
              {chosenSlot && <span style={{ display: "block", fontWeight: 400, color: cssVars["--text-secondary"], marginTop: "2px" }}>{T.willBeScheduled(slotDay(chosenSlot.day, lang).toLowerCase(), chosenSlot.time)}</span>}
            </div>
          )}
          {!blocked && belowMinimum && (
            <div style={{ padding: "12px 16px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], color: cssVars["--text-primary"], fontSize: "14px" }}>
              {T.minimumOrder(euros(minimum), euros(minimum - subtotal))}
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], color: cssVars["--brand-secondary"], fontSize: "14px", fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* SUBMIT: siempre a la vista abajo mientras se rellena el formulario */}
          <div style={{ position: "sticky", bottom: 0, zIndex: 20, margin: "0 -16px", padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", background: `linear-gradient(to bottom, transparent, ${cssVars["--bg-base"]} 28%)` }}>
          <button
            type="submit"
            className="p-press"
            disabled={loading || blocked || belowMinimum || outOfZone}
            style={{ width: "100%", minHeight: "56px", padding: "16px", borderRadius: "999px", border: "none", boxShadow: "0 14px 30px -14px rgba(0,0,0,0.45)", backgroundColor: loading || blocked || belowMinimum || outOfZone ? cssVars["--border"] : cssVars["--brand-accent"], color: loading || blocked || belowMinimum || outOfZone ? cssVars["--text-secondary"] : "var(--on-accent)", fontWeight: 600, fontSize: "16px", cursor: loading || blocked || belowMinimum || outOfZone ? "not-allowed" : "pointer", letterSpacing: "0.3px" }}
          >
            {loading ? (payMethod === "IN_STORE" ? T.sending : T.goingToPay) : blocked ? T.notAccepting : payMethod !== "IN_STORE" ? T.payNow(euros(total)) : chosenSlot ? T.scheduleOrder(euros(total)) : T.confirmOrderTotal(euros(total))}
          </button>
          {/* Aceptación de condiciones y privacidad (información previa al contrato) */}
          <p style={{ marginTop: "8px", fontSize: "11.5px", lineHeight: 1.45, textAlign: "center", color: cssVars["--text-secondary"] }}>
            {T.legalAccept.before}
            <a href={`/pedir/${tenant}/legal/condiciones`} target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "underline" }}>{T.legalAccept.terms}</a>
            {T.legalAccept.and}
            <a href={`/pedir/${tenant}/legal/privacidad`} target="_blank" rel="noopener" style={{ color: "inherit", textDecoration: "underline" }}>{T.legalAccept.privacy}</a>
            {T.legalAccept.after}
          </p>
          </div>

          {/* Sellos: debajo del botón para que al escribir el teléfono no lo empuje. Con cookie del cliente se ven los suyos; sin ella, la genérica (stamps null). */}
              {perks?.loyalty && perksFor && (
                <div>
                  <StampCard
                    lang={lang}
                    ordersRequired={perks.loyalty.ordersRequired}
                    stamps={perksFor.loyalty ? perksFor.loyalty.stamps + 1 : null}
                    rewardName={perks.loyalty.rewardName}
                    rewardReady={!!perksFor.loyalty?.rewardAvailable}
                    upperHeadings={cssVars["--heading-case"] === "uppercase"}
                    note={
                      perksFor.loyalty?.rewardAvailable && reward && reward.missing.length > 0
                        ? reward.matched.length
                          ? T.addAlsoReward(joinLabels(reward.missing).toLowerCase())
                          : T.addForReward(joinLabels(reward.missing).toLowerCase())
                        : null
                    }
                  />
                </div>
              )}

        </form>
      </main>
    </div>
  );
}
