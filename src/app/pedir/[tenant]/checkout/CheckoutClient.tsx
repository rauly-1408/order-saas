/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/store/cart";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";
import { themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import { formatModifier } from "@/app/lib/menuOptions";
import { couponDiscount } from "@/app/lib/retention";
import type { PublicStoreInfo } from "@/app/lib/storeOps";
import { normalizePostalCode, zoneForPostalCode } from "@/app/lib/storeStatus";
import type { PublicPerks } from "@/app/lib/perks";
import DeliveryPartners, { type PartnerLink } from "../DeliveryPartners";
import AddressInput from "./AddressInput";
import StampCard from "../StampCard";
import { bestPromotion, joinLabels, rewardDiscount } from "@/app/lib/promotions";

type PerkState = { firstOrder: boolean; loyalty: { stamps: number; needed: number; rewardAvailable: boolean } | null };

type AppliedCoupon = { code: string; label: string; type: "PERCENT" | "FIXED"; value: number; minOrderCents: number };

const euros = (cents: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);

// Valida un teléfono español: 9 dígitos que empiezan en 6/7/8/9,
// aceptando prefijo +34 / 0034 y espacios o guiones.
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
};

export default function CheckoutClient({ tenant, theme, settings, store, couponsEnabled = false, perks, productInfo = {}, deliveryPartners = [] }: CheckoutClientProps) {
  const router = useRouter();
  const { items, subtotalCents, clear, inc, dec } = useCart();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<"TAKEAWAY" | "DELIVERY">("TAKEAWAY");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [notes, setNotes] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
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
  const slots = (store?.slots?.[channel] ?? []) as { at: string; day: string; time: string }[];
  const [wantSchedule, setWantSchedule] = useState(false);
  const [slotAt, setSlotAt] = useState("");
  const scheduling = closed || wantSchedule;
  const chosenSlot = scheduling ? slots.find((sl) => sl.at === slotAt) ?? slots[0] ?? null : null;
  const days = [...new Set(slots.map((sl) => sl.day))];
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
  const promoWins = !!promo && promo.discountCents > couponAmount;
  const discount = promoWins ? 0 : couponAmount;
  const promoDiscount = promoWins ? promo.discountCents : 0;
  const total = Math.max(subtotal + fee - loyaltyDiscount - promoDiscount - discount, 0);

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res = await fetch(`/api/coupons/${tenant}?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoupon(null);
        setCouponError(data.error ?? "No se pudo aplicar el cupón");
        return;
      }
      setCoupon(data as AppliedCoupon);
      setCouponInput("");
    } catch {
      setCouponError("Error de red. Inténtalo de nuevo.");
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
      setError("Introduce un teléfono válido (9 dígitos, empieza por 6, 7, 8 o 9).");
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
        setError(data.error ?? "Error al crear el pedido");
        return;
      }
      const data = await res.json();
      clear();
      router.push(`/pedir/${tenant}/confirmacion/${data.orderId}`);
    } catch {
      setError("Error de red. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px", padding: "24px", ...(cssVars as any) }}>
        <div style={{ fontSize: "48px" }}>🛒</div>
        <div style={{ fontSize: "18px", fontWeight: 700, color: cssVars["--text-primary"] }}>Tu carrito está vacío</div>
        <a href={`/pedir/${tenant}`} style={{ padding: "13px 28px", borderRadius: "999px", backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>
          Volver al menú
        </a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], fontFamily: cssVars["--font-body"], ...(cssVars as any) }}>

      {/* HEADER */}
      <header className="p-glass" style={{ position: "sticky", top: 0, zIndex: 50, ["--p-surface" as any]: cssVars["--surface-0"], borderBottom: `1px solid ${cssVars["--border"]}`, height: "56px", display: "flex", alignItems: "center", padding: "0 20px", gap: "14px" }}>
        <a href={`/pedir/${tenant}`} style={{ color: cssVars["--brand-accent"], fontSize: "22px", textDecoration: "none", lineHeight: "1" }}>←</a>
        <span style={{ fontWeight: 600, fontSize: "16px" }}>Confirmar pedido</span>
      </header>

      <main style={{ maxWidth: "560px", margin: "0 auto", padding: "24px 16px 120px" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* RESUMEN DEL PEDIDO */}
          <div style={{ backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)", borderRadius: "18px", padding: "20px" }}>
            <div style={{ fontSize: "13px", fontWeight: 500, color: cssVars["--text-secondary"], marginBottom: "14px" }}>
              Tu pedido · {count} {count === 1 ? "producto" : "productos"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {items.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: cssVars["--text-primary"] }}>{item.name}</div>
                    {item.modifiers.length > 0 && (
                      <div style={{ fontSize: "12px", color: cssVars["--text-secondary"], marginTop: "2px", lineHeight: 1.4 }}>
                        {item.modifiers.map(formatModifier).join(" · ")}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                      <button type="button" aria-label={`Quitar un ${item.name}`} onClick={() => dec(item.id)} style={{ width: "26px", height: "26px", borderRadius: "50%", border: `1px solid ${cssVars["--brand-accent"]}`, backgroundColor: "transparent", color: cssVars["--brand-accent"], fontWeight: 700, fontSize: "15px", cursor: "pointer", lineHeight: 1 }}>−</button>
                      <span style={{ fontWeight: 700, fontSize: "14px", minWidth: "14px", textAlign: "center" }}>{item.quantity}</span>
                      <button type="button" aria-label={`Añadir otro ${item.name}`} onClick={() => inc(item.id)} style={{ width: "26px", height: "26px", borderRadius: "50%", border: "none", backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)", fontWeight: 700, fontSize: "15px", cursor: "pointer", lineHeight: 1 }}>+</button>
                    </div>
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: cssVars["--text-primary"], flexShrink: 0 }}>
                    {euros(item.unitPriceCents * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* TOTALES */}
            <div style={{ borderTop: `1px solid ${cssVars["--border"]}`, marginTop: "16px", paddingTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: cssVars["--text-secondary"] }}>
                <span>Subtotal</span>
                <span>{euros(subtotal)}</span>
              </div>
              {loyaltyDiscount > 0 && reward && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>
                  <span>🎁 Premio: {joinLabels(reward.matched).toLowerCase()} gratis</span>
                  <span>−{euros(loyaltyDiscount)}</span>
                </div>
              )}
              {promoDiscount > 0 && promo && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", fontSize: "13px", color: cssVars["--brand-secondary"], fontWeight: 600 }}>
                  <span>🏷️ {promo.promotion.name}</span>
                  <span>−{euros(promoDiscount)}</span>
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
                  <span>Gastos de envío</span>
                  <span>{zones.length && !zone ? "Según código postal" : fee === 0 ? "Gratis" : euros(fee)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700, color: cssVars["--text-primary"] }}>
                <span>Total</span>
                <span style={{ color: cssVars["--brand-accent"] }}>{euros(total)}</span>
              </div>
            </div>
          </div>

          {/* CUPÓN */}
          {couponsEnabled && (
            <div>
              <div style={labelStyle}>Cupón de descuento</div>
              {coupon ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 16px", borderRadius: "12px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "15px" }}>{coupon.code} · {coupon.label}</div>
                    {!couponBelowMin && promoWins && promo && (
                      <div style={{ fontSize: "12px", color: cssVars["--text-secondary"] }}>No se acumula: «{promo.promotion.name}» te ahorra más y es la que se aplica</div>
                    )}
                    {couponBelowMin && (
                      <div style={{ fontSize: "12px", color: cssVars["--text-secondary"] }}>Añade productos hasta {euros(coupon.minOrderCents)} para usarlo</div>
                    )}
                  </div>
                  <button type="button" onClick={() => setCoupon(null)} style={{ background: "none", border: "none", color: cssVars["--text-secondary"], fontSize: "13px", cursor: "pointer", flexShrink: 0 }}>
                    Quitar
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
                    {couponLoading ? "…" : "Aplicar"}
                  </button>
                </div>
              )}
              {couponError && <div style={{ fontSize: "13px", color: cssVars["--brand-secondary"], marginTop: "6px" }}>{couponError}</div>}
            </div>
          )}

          {/* MODALIDAD */}
          {(deliveryEnabled || takeawayEnabled || deliveryPartners.length > 0) && (
            <div>
              <div style={labelStyle}>Modalidad</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {takeawayEnabled && (
                  <button
                    type="button"
                    onClick={() => { setChannel("TAKEAWAY"); setShowPartners(false); }}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${takeawayOn ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: takeawayOn ? `${cssVars["--brand-accent"]}15` : "transparent", color: takeawayOn ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: takeawayOn ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    🏪 Recoger
                  </button>
                )}
                {deliveryEnabled && (
                  <button
                    type="button"
                    onClick={() => setChannel("DELIVERY")}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${channel === "DELIVERY" ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: channel === "DELIVERY" ? `${cssVars["--brand-accent"]}15` : "transparent", color: channel === "DELIVERY" ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: channel === "DELIVERY" ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    🛵 Delivery
                  </button>
                )}
                {!deliveryEnabled && deliveryPartners.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPartners(!showPartners)}
                    aria-expanded={showPartners}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${showPartners ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: showPartners ? `${cssVars["--brand-accent"]}15` : "transparent", color: showPartners ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: showPartners ? 700 : 400, fontSize: "14px", cursor: "pointer" }}
                  >
                    🛵 A domicilio
                  </button>
                )}
              </div>
              {showPartners && !deliveryEnabled && (
                <div style={{ marginTop: "12px", padding: "14px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "2px" }}>Escoge quién te lo lleva</div>
                  <div style={{ fontSize: "12px", color: cssVars["--text-secondary"], marginBottom: "10px" }}>
                    El reparto lo hacen estas plataformas: el pedido y el pago se hacen en su app (tu carrito de aquí no se pasa). Para recoger, sigue aquí.
                  </div>
                  <DeliveryPartners partners={deliveryPartners} compact />
                </div>
              )}
            </div>
          )}

          {/* ¿CUÁNDO? — lo antes posible o programado */}
          {(slots.length > 0 || closed) && (
            <div>
              <div style={labelStyle}>¿Cuándo lo quieres?</div>
              <div style={{ display: "flex", gap: "10px" }}>
                {!closed && (
                  <button type="button" onClick={() => setWantSchedule(false)} aria-pressed={!scheduling}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${!scheduling ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: !scheduling ? `${cssVars["--brand-accent"]}15` : "transparent", color: !scheduling ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: !scheduling ? 700 : 400, fontSize: "14px", cursor: "pointer" }}>
                    ⚡ Lo antes posible
                    <span style={{ display: "block", fontSize: "12px", fontWeight: 400 }}>unos {channel === "DELIVERY" ? settings?.estimatedDeliveryMinutes ?? 45 : settings?.estimatedPickupMinutes ?? 20} min</span>
                  </button>
                )}
                {slots.length > 0 && (
                  <button type="button" onClick={() => setWantSchedule(true)} aria-pressed={scheduling}
                    style={{ flex: 1, padding: "12px", borderRadius: "12px", border: `2px solid ${scheduling ? cssVars["--brand-accent"] : cssVars["--border"]}`, backgroundColor: scheduling ? `${cssVars["--brand-accent"]}15` : "transparent", color: scheduling ? cssVars["--brand-accent"] : cssVars["--text-secondary"], fontWeight: scheduling ? 700 : 400, fontSize: "14px", cursor: "pointer" }}>
                    🕐 Programar
                    <span style={{ display: "block", fontSize: "12px", fontWeight: 400 }}>{chosenSlot ? `${chosenSlot.day}, ${chosenSlot.time}` : "elige día y hora"}</span>
                  </button>
                )}
              </div>
              {scheduling && slots.length > 0 && (
                <div style={{ marginTop: "12px", padding: "14px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
                    {days.map((d) => {
                      const on = chosenSlot?.day === d;
                      return (
                        <button key={d} type="button" onClick={() => setSlotAt(slots.find((sl) => sl.day === d)!.at)} aria-pressed={on}
                          style={{ padding: "7px 14px", borderRadius: "999px", border: on ? "none" : `1px solid ${cssVars["--border"]}`, backgroundColor: on ? cssVars["--brand-accent"] : "transparent", color: on ? "var(--on-accent)" : cssVars["--text-primary"], fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                          {d}
                        </button>
                      );
                    })}
                  </div>
                  <label style={{ ...labelStyle, marginBottom: "4px" }} htmlFor="slot-time">{channel === "DELIVERY" ? "Hora de entrega" : "Hora de recogida"}</label>
                  <select id="slot-time" value={chosenSlot?.at ?? ""} onChange={(e) => setSlotAt(e.target.value)} style={{ ...inputStyle, appearance: "auto" }}>
                    {slots.filter((sl) => sl.day === chosenSlot?.day).map((sl) => (
                      <option key={sl.at} value={sl.at}>{sl.time}</option>
                    ))}
                  </select>
                </div>
              )}
              {closed && slots.length === 0 && (
                <div style={{ marginTop: "8px", fontSize: "13px", color: cssVars["--text-secondary"] }}>No hay horas disponibles para programar en los próximos días.</div>
              )}
            </div>
          )}

          {/* DATOS DE CONTACTO */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input
                style={inputStyle}
                type="text"
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Teléfono *</label>
              <input
                style={inputStyle}
                type="tel"
                placeholder="6XX XXX XXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              {perks?.loyalty && perksFor?.loyalty && (
                <div style={{ marginTop: "10px" }}>
                  <StampCard
                    ordersRequired={perks.loyalty.ordersRequired}
                    stamps={perksFor.loyalty.stamps + 1}
                    rewardName={perks.loyalty.rewardName}
                    rewardReady={perksFor.loyalty.rewardAvailable}
                    upperHeadings={cssVars["--heading-case"] === "uppercase"}
                    note={
                      perksFor.loyalty.rewardAvailable && reward && reward.missing.length > 0
                        ? reward.matched.length
                          ? `Añade también ${joinLabels(reward.missing).toLowerCase()}: entra en el premio.`
                          : `Añade ${joinLabels(reward.missing).toLowerCase()} para usarlo. Si no, lo guardamos para tu próximo pedido.`
                        : null
                    }
                  />
                </div>
              )}
            </div>
            {channel === "DELIVERY" && (
              <div>
                <label style={labelStyle}>Dirección de entrega *</label>
                <AddressInput
                  tenant={tenant}
                  value={address}
                  onChange={setAddress}
                  onPick={(sug) => {
                    setAddress(sug.street);
                    if (sug.postalCode) setPostalCode(sug.postalCode);
                  }}
                  inputStyle={inputStyle}
                />
                <div style={{ fontSize: "12px", color: cssVars["--text-secondary"], marginTop: "4px" }}>Piso y puerta, en las notas.</div>
              </div>
            )}
            {channel === "DELIVERY" && zones.length > 0 && (
              <div>
                <label style={labelStyle}>Código postal *</label>
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
                    Repartimos en {zone.name}: envío {zone.feeCents === 0 ? "gratis" : euros(zone.feeCents)}
                    {zone.minOrderCents > 0 && ` · pedido mínimo ${euros(zone.minOrderCents)}`}
                  </div>
                )}
                {outOfZone && (
                  <div style={{ fontSize: "13px", color: cssVars["--brand-secondary"], marginTop: "6px", fontWeight: 600 }}>
                    No repartimos en el {cp}. Puedes pedir para recoger.
                  </div>
                )}
              </div>
            )}
            <div>
              <label style={labelStyle}>Notas (opcional)</label>
              <textarea
                style={{ ...inputStyle, minHeight: "80px", resize: "vertical" } as React.CSSProperties}
                placeholder="Sin cebolla, alergia a los frutos secos..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* CONSENTIMIENTO DE MARKETING — opt-in explícito, desmarcado por defecto (RGPD + LSSI) */}
          <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", lineHeight: 1.45, color: cssVars["--text-secondary"], cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              style={{ marginTop: "2px", width: "18px", height: "18px", flexShrink: 0, accentColor: cssVars["--brand-accent"] }}
            />
            <span>
              Quiero recibir ofertas y novedades de este restaurante por WhatsApp o SMS.
              Puedo darme de baja en cualquier momento.
            </span>
          </label>

          {/* CERRADO / MÍNIMO */}
          {store && !store.status.open && (
            <div style={{ padding: "12px 16px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], color: cssVars["--brand-secondary"], fontSize: "14px", fontWeight: 600 }}>
              {store.status.message}.{store.status.reopens ? ` Volvemos a abrir ${store.status.reopens}.` : ""}
              {chosenSlot && <span style={{ display: "block", fontWeight: 400, color: cssVars["--text-secondary"], marginTop: "2px" }}>Tu pedido quedará programado para {chosenSlot.day.toLowerCase()} a las {chosenSlot.time}.</span>}
            </div>
          )}
          {!blocked && belowMinimum && (
            <div style={{ padding: "12px 16px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], color: cssVars["--text-primary"], fontSize: "14px" }}>
              El pedido mínimo a domicilio es de {euros(minimum)}. Te faltan {euros(minimum - subtotal)}.
            </div>
          )}

          {/* ERROR */}
          {error && (
            <div style={{ padding: "12px 16px", borderRadius: "14px", backgroundColor: cssVars["--surface-1"], color: cssVars["--brand-secondary"], fontSize: "14px", fontWeight: 600 }}>
              {error}
            </div>
          )}

          {/* SUBMIT */}
          <button
            type="submit"
            disabled={loading || blocked || belowMinimum || outOfZone}
            style={{ width: "100%", padding: "16px", borderRadius: "999px", border: "none", backgroundColor: loading || blocked || belowMinimum || outOfZone ? cssVars["--border"] : cssVars["--brand-accent"], color: loading || blocked || belowMinimum || outOfZone ? cssVars["--text-secondary"] : "var(--on-accent)", fontWeight: 600, fontSize: "16px", cursor: loading || blocked || belowMinimum || outOfZone ? "not-allowed" : "pointer", letterSpacing: "0.3px" }}
          >
            {loading ? "Enviando pedido..." : blocked ? "Ahora mismo no aceptamos pedidos" : chosenSlot ? `Programar pedido · ${euros(total)}` : `Confirmar pedido · ${euros(total)}`}
          </button>

        </form>
      </main>
    </div>
  );
}
