/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/store/cart";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";
import { themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import type { MenuModifierGroup } from "@/app/lib/menuOptions";
import type { PublicPerks } from "@/app/lib/perks";
import { SOCIAL_FIELDS, type OnlinePresence } from "@/app/lib/brand";
import { promotionConditions, promotionLabel } from "@/app/lib/promotions";
import type { PublicStoreInfo } from "@/app/lib/storeOps";
import ProductOptionsSheet from "./ProductOptionsSheet";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  imageUrl?: string | null;
  isFeatured?: boolean;
  modifierGroups: MenuModifierGroup[];
  allergens?: string[];
};

type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  products: MenuProduct[];
};

type MenuClientProps = {
  tenant: string;
  tenantName: string;
  categories: MenuCategory[];
  theme?: TenantTheme;
  settings?: StoreSettings;
  store?: PublicStoreInfo | null;
  perks?: PublicPerks;
  online?: OnlinePresence;
};

const euros = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function MenuClient({ tenant, tenantName, categories, theme, settings, store, perks, online }: MenuClientProps) {
  const { items, addItem, inc, dec, remove, clear } = useCart();
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug ?? "");
  // Producto cuyo selector de opciones (pan, guarnición, extras) está abierto.
  const [optionsFor, setOptionsFor] = useState<MenuProduct | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Usar el theme del tenant o los defaults del sistema
  const t = theme ?? SYSTEM_DEFAULT_THEME;
  const cssVars = themeToCssVars(t);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  // Mostrar delivery o takeaway según config
  const deliveryLabel = settings?.deliveryEnabled && settings?.takeawayEnabled
    ? "Delivery y recogida"
    : settings?.deliveryEnabled
    ? "Delivery"
    : settings?.takeawayEnabled
    ? "Solo recogida"
    : "Pedidos online";

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    categories.forEach((cat) => {
      const el = sectionRefs.current[cat.slug];
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveCategory(cat.slug); },
        { rootMargin: "-40% 0px -55% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  useEffect(() => {
    const nav = navRef.current;
    const pill = nav?.querySelector(`[data-slug="${activeCategory}"]`) as HTMLElement | null;
    if (nav && pill) {
      nav.scrollTo({ left: pill.offsetLeft - nav.clientWidth / 2 + pill.clientWidth / 2, behavior: "smooth" });
    }
  }, [activeCategory]);

  function scrollToCategory(slug: string) {
    const el = sectionRefs.current[slug];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveCategory(slug);
  }

  function getQty(productId: string): number {
    return items.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0);
  }

  function getLineId(productId: string): string | null {
    const item = items.find((i) => i.productId === productId);
    return item ? item.id : null;
  }

  function handleAdd(product: MenuProduct) {
    if (product.modifierGroups.length > 0) {
      setOptionsFor(product);
      return;
    }
    addItem({ productId: product.id, name: product.name, unitPriceCents: product.basePriceCents, optionIds: [], modifiers: [] });
  }

  const initials = tenantName.slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], fontFamily: cssVars["--font-body"], ...cssVars as any }}>
      <header className="p-glass" style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: `1px solid ${cssVars["--border"]}`, height: "64px", ["--p-surface" as any]: cssVars["--header-bg"], display: "flex", alignItems: "center", padding: "0 20px", gap: "14px" }}>
        {t.logoUrl ? (
          <img src={t.logoUrl} alt={tenantName} style={{ height: "36px", width: "auto", borderRadius: "8px", flexShrink: 0 }} />
        ) : (
          <div style={{ width: "40px", height: "40px", borderRadius: "12px", backgroundColor: cssVars["--brand-accent"], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "15px", color: "var(--on-accent)", flexShrink: 0 }}>
            {initials}
          </div>
        )}
        {/* Con logo, el nombre escrito sobra (el logo ya lo dice y lleva el nombre como alt) */}
        <div>
          {!t.logoUrl && <div style={{ fontWeight: 600, fontSize: "16px", color: cssVars["--on-header"], lineHeight: 1.2 }}>{tenantName}</div>}
          <div style={{ fontSize: "12px", color: cssVars["--on-header"], opacity: 0.7 }}>{deliveryLabel}</div>
        </div>
      </header>
      <nav ref={navRef} className="p-glass" style={{ position: "sticky", top: "64px", zIndex: 40, ["--p-surface" as any]: cssVars["--surface-0"], borderBottom: `1px solid ${cssVars["--border"]}`, display: "flex", gap: "8px", overflowX: "auto", padding: "10px 16px", scrollbarWidth: "none" }}>
        {categories.map((cat) => {
          const isActive = activeCategory === cat.slug;
          return (
            <button key={cat.slug} data-slug={cat.slug} onClick={() => scrollToCategory(cat.slug)} className="p-press" style={{ flexShrink: 0, padding: "7px 16px", borderRadius: "999px", border: isActive ? "none" : `1px solid ${cssVars["--border"]}`, backgroundColor: isActive ? cssVars["--brand-accent"] : "transparent", color: isActive ? "var(--on-accent)" : cssVars["--text-secondary"], fontWeight: isActive ? 600 : 500, fontSize: "14px", cursor: "pointer" }}>
              {cat.name}
            </button>
          );
        })}
      </nav>
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-[120px]">
        {/* Cerrado / en pausa: se puede mirar la carta, pero no pedir */}
        {store && !store.status.open && (
          <div className="p-rise mb-4 rounded-2xl px-5 py-4" style={{ backgroundColor: cssVars["--surface-0"], boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
            <p style={{ fontWeight: 700, fontSize: "16px", color: cssVars["--brand-secondary"] }}>{store.status.message}</p>
            <p style={{ fontSize: "14px", color: cssVars["--text-secondary"] }}>
              {store.status.reopens ? `Volvemos a abrir ${store.status.reopens}. ` : ""}Puedes ver la carta mientras tanto.
            </p>
          </div>
        )}
        {/* Portada: nombre del restaurante en la fuente de rótulo de la marca */}
        <section
          className="p-rise mb-10 overflow-hidden rounded-[28px] px-6 py-10 sm:px-10 sm:py-14"
          style={{
            backgroundColor: cssVars["--brand-accent"],
            color: t.heroImageUrl ? "#ffffff" : cssVars["--on-accent"],
            // Foto de portada (Personalización) con un velo oscuro para que el texto se lea.
            ...(t.heroImageUrl && { backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.55)), url("${t.heroImageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }),
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 500, opacity: 0.75 }}>{deliveryLabel}</p>
          <h1 className="mt-2 text-5xl sm:text-7xl" style={{ fontFamily: cssVars["--font-heading"], textTransform: cssVars["--heading-case"] as any, fontWeight: cssVars["--heading-case"] === "uppercase" ? 400 : 700, lineHeight: 0.95, color: t.heroImageUrl ? "#ffffff" : cssVars["--bg-base"] }}>{tenantName}</h1>
          <p className="mt-4 max-w-md" style={{ fontSize: "15px", opacity: 0.8 }}>Elige, personaliza y te lo preparamos al momento.</p>
        </section>
        {/* Promociones en vigor y tarjeta de fidelidad: se aplican solas en el checkout */}
        {perks && (perks.promotions.length > 0 || perks.loyalty) && (
          <section className="p-rise -mt-6 mb-10 grid gap-3 sm:grid-cols-2" aria-label="Promociones">
            {perks.loyalty && (
              <div className="rounded-2xl px-5 py-4" style={{ backgroundColor: cssVars["--surface-0"], boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                <p style={{ fontWeight: 700, fontSize: "15px", color: cssVars["--text-primary"] }}>🎁 {perks.loyalty.rewardName}</p>
                <p style={{ fontSize: "13px", color: cssVars["--text-secondary"], marginTop: "2px" }}>
                  En tu {perks.loyalty.ordersRequired}.º pedido. Cada pedido suma un sello con tu teléfono, sin registrarte.
                </p>
              </div>
            )}
            {perks.promotions.map((p) => {
              const cond = promotionConditions(p);
              return (
                <div key={p.id} className="rounded-2xl px-5 py-4" style={{ backgroundColor: cssVars["--surface-0"], boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                  <p style={{ fontWeight: 700, fontSize: "15px", color: cssVars["--text-primary"] }}>🏷️ {p.name.toLowerCase() === promotionLabel(p).toLowerCase() ? p.name : `${p.name}: ${promotionLabel(p).toLowerCase()}`}</p>
                  <p style={{ fontSize: "13px", color: cssVars["--text-secondary"], marginTop: "2px" }}>{cond ? `${cond[0].toUpperCase()}${cond.slice(1)}. ` : ""}Se aplica sola al pedir.</p>
                </div>
              );
            })}
          </section>
        )}
        {categories.map((cat) => (
          <section key={cat.slug} ref={(el) => { sectionRefs.current[cat.slug] = el; }} style={{ marginBottom: "40px" }}>
            <h2 style={{ fontFamily: cssVars["--font-heading"], textTransform: cssVars["--heading-case"] as any, fontSize: "30px", lineHeight: 1, fontWeight: cssVars["--heading-case"] === "uppercase" ? 400 : 700, letterSpacing: "-0.01em", color: cssVars["--heading-color"], marginBottom: "16px" }}>{cat.name}</h2>
            {cat.description && <p style={{ fontSize: "14px", color: cssVars["--text-secondary"], marginTop: "-6px", marginBottom: "16px" }}>{cat.description}</p>}
            {/* Cuadrícula: 1 columna en móvil, 2 en tablet, 3 en escritorio */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cat.products.map((product, i) => {
                const qty = getQty(product.id);
                const lineId = getLineId(product.id);
                return (
                  <div key={product.id} className="p-rise p-lift flex flex-col overflow-hidden" style={{ ["--i" as any]: Math.min(i, 8), backgroundColor: cssVars["--surface-1"], borderRadius: t.borderRadius, boxShadow: qty > 0 ? `0 0 0 2px ${cssVars["--brand-accent"]}` : "0 1px 2px rgba(0,0,0,0.05)" }}>
                    {product.imageUrl && (
                      <img src={product.imageUrl} alt={product.name} className="aspect-[4/3] w-full object-cover" />
                    )}
                    <div className="flex-1 px-4 pt-4">
                      <div style={{ fontWeight: 600, fontSize: "17px", letterSpacing: "-0.01em", color: cssVars["--text-primary"], marginBottom: "4px" }}>{product.name}</div>
                      {product.description && <div style={{ fontSize: "13px", color: cssVars["--text-secondary"], lineHeight: 1.45 }}>{product.description}</div>}
                      {product.allergens && product.allergens.length > 0 && (
                        <div style={{ fontSize: "11px", color: cssVars["--text-secondary"], marginTop: "6px" }}>
                          Alérgenos: {product.allergens.join(", ")}
                        </div>
                      )}
                    </div>
                    {/* Pie de tarjeta: precio y acción alineados abajo en toda la fila */}
                    <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-4">
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "17px", color: cssVars["--brand-secondary"] }}>{euros(product.basePriceCents)}</div>
                        {product.modifierGroups.length > 0 && qty > 0 && (
                          <div style={{ fontSize: "11px", color: cssVars["--brand-accent"], fontWeight: 600 }}>{qty} en tu pedido</div>
                        )}
                      </div>
                      {product.modifierGroups.length > 0 || qty === 0 ? (
                        // Con opciones, cada combinación es una línea distinta: siempre "Añadir"
                        // (las cantidades se ajustan en el checkout).
                        <button onClick={() => handleAdd(product)} className="p-press" style={{ padding: "9px 20px", borderRadius: "999px", border: "none", backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>
                          Añadir
                        </button>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button onClick={() => { if (qty === 1 && lineId) remove(lineId); else if (lineId) dec(lineId); }} style={{ width: "30px", height: "30px", borderRadius: "50%", border: `1px solid ${cssVars["--brand-accent"]}`, backgroundColor: "transparent", color: cssVars["--brand-accent"], fontWeight: 700, fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                          <span style={{ fontWeight: 700, fontSize: "15px", color: cssVars["--text-primary"], minWidth: "16px", textAlign: "center" }}>{qty}</span>
                          <button onClick={() => { if (lineId) inc(lineId); }} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)", fontWeight: 700, fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {/* Redes y reseñas (Personalización → Presencia online) */}
        {online && SOCIAL_FIELDS.some((f) => online[f.key]) && (
          <footer className="mt-4 flex flex-wrap items-center justify-center gap-2 pb-4" aria-label="Síguenos">
            {SOCIAL_FIELDS.filter((f) => online[f.key]).map((f) => (
              <a key={f.key} href={online[f.key]!} target="_blank" rel="noopener noreferrer" className="p-press rounded-full px-4 py-2 text-sm font-semibold" style={{ border: `1px solid ${cssVars["--border"]}`, color: cssVars["--text-primary"], textDecoration: "none" }}>
                {f.key === "reviewsUrl" ? "★ Déjanos una reseña" : f.label}
              </a>
            ))}
          </footer>
        )}
      </main>
      {optionsFor && (
        <ProductOptionsSheet
          product={optionsFor}
          onClose={() => setOptionsFor(null)}
          onAdd={(line) => {
            addItem({ productId: optionsFor.id, name: optionsFor.name, ...line });
            setOptionsFor(null);
          }}
        />
      )}
      {totalItems > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: cssVars["--surface-0"], boxShadow: "0 -8px 24px -16px rgba(0,0,0,0.25)", borderTop: `1px solid ${cssVars["--border"]}`, padding: "12px 16px calc(12px + env(safe-area-inset-bottom))", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "16px", color: cssVars["--text-primary"], whiteSpace: "nowrap" }}>{euros(totalCents)}</div>
            <div style={{ fontSize: "12px", color: cssVars["--text-secondary"], whiteSpace: "nowrap" }}>{totalItems} {totalItems === 1 ? "artículo" : "artículos"}</div>
          </div>
          <button onClick={clear} className="p-press" style={{ padding: "8px 12px", borderRadius: "999px", border: `1px solid ${cssVars["--border"]}`, backgroundColor: "transparent", color: cssVars["--text-secondary"], fontSize: "13px", cursor: "pointer", flexShrink: 0 }}>Vaciar</button>
          <a href={`/pedir/${tenant}/checkout`} className="p-press" style={{ padding: "11px 20px", borderRadius: "999px", backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)", fontWeight: 600, fontSize: "15px", textDecoration: "none", display: "inline-block", whiteSpace: "nowrap", flexShrink: 0 }}>Ver pedido</a>
        </div>
      )}
    </div>
  );
}
