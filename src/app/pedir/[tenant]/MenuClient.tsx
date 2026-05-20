/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/store/cart";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";
import { themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  imageUrl?: string | null;
  isFeatured?: boolean;
};

type MenuCategory = {
  id: string;
  name: string;
  slug: string;
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
};

const euros = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function MenuClient({ tenant, tenantName, categories, theme, settings }: MenuClientProps) {
  const { items, addItem, inc, dec, remove, clear } = useCart();
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug ?? "");
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

  const initials = tenantName.slice(0, 2).toUpperCase();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], ...cssVars as any }}>
      <header style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: cssVars["--surface-0"], borderBottom: `1px solid ${cssVars["--border"]}`, height: "64px", display: "flex", alignItems: "center", padding: "0 20px", gap: "14px" }}>
        {t.logoUrl ? (
          <img src={t.logoUrl} alt={tenantName} style={{ height: "36px", width: "auto", borderRadius: "8px", flexShrink: 0 }} />
        ) : (
          <div style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: cssVars["--brand-accent"], display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "15px", color: "#0d0d0d", flexShrink: 0 }}>
            {initials}
          </div>
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: "16px", color: cssVars["--text-primary"], lineHeight: 1.2 }}>{tenantName}</div>
          <div style={{ fontSize: "12px", color: cssVars["--text-secondary"] }}>{deliveryLabel}</div>
        </div>
      </header>
      <nav ref={navRef} style={{ position: "sticky", top: "64px", zIndex: 40, backgroundColor: cssVars["--surface-0"], borderBottom: `1px solid ${cssVars["--border"]}`, display: "flex", gap: "8px", overflowX: "auto", padding: "10px 16px", scrollbarWidth: "none" }}>
        {categories.map((cat) => {
          const isActive = activeCategory === cat.slug;
          return (
            <button key={cat.slug} data-slug={cat.slug} onClick={() => scrollToCategory(cat.slug)} style={{ flexShrink: 0, padding: "6px 16px", borderRadius: "999px", border: isActive ? "none" : `1px solid ${cssVars["--border"]}`, backgroundColor: isActive ? cssVars["--brand-accent"] : "transparent", color: isActive ? "#0d0d0d" : cssVars["--text-secondary"], fontWeight: isActive ? 700 : 400, fontSize: "13px", cursor: "pointer" }}>
              {cat.name}
            </button>
          );
        })}
      </nav>
      <main style={{ maxWidth: "760px", margin: "0 auto", padding: "24px 16px 120px" }}>
        {categories.map((cat) => (
          <section key={cat.slug} ref={(el) => { sectionRefs.current[cat.slug] = el; }} style={{ marginBottom: "40px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: cssVars["--text-primary"], marginBottom: "16px", paddingBottom: "8px", borderBottom: `1px solid ${cssVars["--border"]}` }}>{cat.name}</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {cat.products.map((product) => {
                const qty = getQty(product.id);
                const lineId = getLineId(product.id);
                return (
                  <div key={product.id} style={{ backgroundColor: cssVars["--surface-1"], borderRadius: t.borderRadius, border: qty > 0 ? `1px solid ${cssVars["--brand-accent"]}` : `1px solid ${cssVars["--border"]}`, padding: "16px", display: "flex", alignItems: "center", gap: "16px" }}>
                    {product.imageUrl && (
                      <img src={product.imageUrl} alt={product.name} style={{ width: "80px", height: "80px", objectFit: "cover", borderRadius: "10px", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: "15px", color: cssVars["--text-primary"], marginBottom: "4px" }}>{product.name}</div>
                      <div style={{ fontSize: "13px", color: cssVars["--text-secondary"], lineHeight: 1.4, marginBottom: "8px" }}>{product.description}</div>
                      <div style={{ fontWeight: 700, fontSize: "15px", color: cssVars["--brand-accent"] }}>{euros(product.basePriceCents)}</div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {qty === 0 ? (
                        <button onClick={() => addItem({ productId: product.id, name: product.name, unitPriceCents: product.basePriceCents })} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", backgroundColor: cssVars["--brand-accent"], color: "#0d0d0d", fontWeight: 700, fontSize: "14px", cursor: "pointer" }}>
                          Añadir
                        </button>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <button onClick={() => { if (qty === 1 && lineId) remove(lineId); else if (lineId) dec(lineId); }} style={{ width: "30px", height: "30px", borderRadius: "50%", border: `1px solid ${cssVars["--brand-accent"]}`, backgroundColor: "transparent", color: cssVars["--brand-accent"], fontWeight: 700, fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                          <span style={{ fontWeight: 700, fontSize: "15px", color: cssVars["--text-primary"], minWidth: "16px", textAlign: "center" }}>{qty}</span>
                          <button onClick={() => { if (lineId) inc(lineId); }} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", backgroundColor: cssVars["--brand-accent"], color: "#0d0d0d", fontWeight: 700, fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      {totalItems > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50, backgroundColor: cssVars["--surface-0"], borderTop: `1px solid ${cssVars["--border"]}`, padding: "12px 20px", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: "14px", color: cssVars["--text-primary"] }}>Carrito</div>
            <div style={{ fontSize: "13px", color: cssVars["--text-secondary"] }}>{totalItems} {totalItems === 1 ? "artículo" : "artículos"} · {euros(totalCents)}</div>
          </div>
          <button onClick={clear} style={{ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${cssVars["--border"]}`, backgroundColor: "transparent", color: cssVars["--text-secondary"], fontSize: "13px", cursor: "pointer" }}>Vaciar</button>
          <a href={`/pedir/${tenant}/checkout`} style={{ padding: "10px 22px", borderRadius: "10px", backgroundColor: cssVars["--brand-accent"], color: "#0d0d0d", fontWeight: 700, fontSize: "15px", textDecoration: "none", display: "inline-block" }}>Ver pedido →</a>
        </div>
      )}
    </div>
  );
}
