"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/store/cart";

type MenuProduct = {
      id: string;
      name: string;
      description: string;
      basePriceCents: number;
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
};

const euros = (cents: number) =>
      (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function MenuClient({ tenant, tenantName, categories }: MenuClientProps) {
      const { items, addItem, removeItem, clearCart } = useCart();
      const [activeCategory, setActiveCategory] = useState(categories[0]?.slug ?? "");
      const navRef = useRef<HTMLDivElement>(null);
      const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
      const totalCents = items.reduce((s, i) => s + i.price * i.quantity, 0);

  // IntersectionObserver: activa la pill de la categoría visible
  useEffect(() => {
          const observers: IntersectionObserver[] = [];
          categories.forEach((cat) => {
                    const el = sectionRefs.current[cat.slug];
                    if (!el) return;
                    const obs = new IntersectionObserver(
                                ([entry]) => {
                                              if (entry.isIntersecting) setActiveCategory(cat.slug);
                                },
                        { rootMargin: "-40% 0px -55% 0px" }
                              );
                    obs.observe(el);
                    observers.push(obs);
          });
          return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  // Scroll la pill activa al centro del nav
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

  const initials = tenantName.slice(0, 2).toUpperCase();

  return (
          <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
              {/* HEADER */}
                    <header style={{
                      position: "sticky", top: 0, zIndex: 50,
                      backgroundColor: "var(--surface-0)",
                      borderBottom: "1px solid var(--border)",
                      height: "64px", display: "flex", alignItems: "center", padding: "0 20px", gap: "14px"
          }}>
                                <div style={{
                        width: "40px", height: "40px", borderRadius: "10px",
                        backgroundColor: "var(--brand-accent)", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: "15px", color: "#0d0d0d", flexShrink: 0
          }}>
                                    {initials}
                                </div>div>
                                <div>
                                          <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-primary)", lineHeight: 1.2 }}>
                                              {tenantName}
                                          </div>div>
                                          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                                      Delivery · Recogida
                                          </div>div>
                                </div>div>
                    </header>header>
          
              {/* NAV CATEGORÍAS */}
                <nav ref={navRef} style={{
                      position: "sticky", top: "64px", zIndex: 40,
                      backgroundColor: "var(--surface-0)",
                      borderBottom: "1px solid var(--border)",
                      display: "flex", gap: "8px",
                      overflowX: "auto", padding: "10px 16px",
                      scrollbarWidth: "none"
          }}>
                    {categories.map((cat) => {
                        const isActive = activeCategory === cat.slug;
                        return (
                                        <button
                                                          key={cat.slug}
                                                          data-slug={cat.slug}
                                                          onClick={() => scrollToCategory(cat.slug)}
                                                          style={{
                                                                              flexShrink: 0, padding: "7px 16px", borderRadius: "999px",
                                                                              fontSize: "13px", fontWeight: isActive ? 700 : 500,
                                                                              cursor: "pointer", border: "none", transition: "all 0.2s",
                                                                              backgroundColor: isActive ? "var(--brand-accent)" : "var(--surface-1)",
                                                                              color: isActive ? "#0d0d0d" : "var(--text-secondary)"
                                                          }}
                                                        >
                                            {cat.name}
                                        </button>button>
                                      );
          })}
                </nav>nav>
          
              {/* CONTENIDO */}
                <main style={{ maxWidth: "720px", margin: "0 auto", padding: "0 16px 120px" }}>
                    {categories.map((cat) => (
                        <section
                                        key={cat.slug}
                                        ref={(el) => { sectionRefs.current[cat.slug] = el; }}
                                        style={{ paddingTop: "32px" }}
                                      >
                            {/* Título categoría */}
                                    <h2 style={{
                                                        fontSize: "18px", fontWeight: 700,
                                                        color: "var(--text-primary)",
                                                        marginBottom: "16px",
                                                        letterSpacing: "-0.3px"
                                      }}>
                                        {cat.name}
                                    </h2>h2>
                        
                            {/* Grid productos */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                        {cat.products.map((product) => {
                                                          const qty = items.find((i) => i.id === product.id)?.quantity ?? 0;
                                                          return (
                                                                                <div
                                                                                                        key={product.id}
                                                                                                        style={{
                                                                                                                                  backgroundColor: "var(--surface-1)",
                                                                                                                                  border: "1px solid var(--border)",
                                                                                                                                  borderRadius: "14px",
                                                                                                                                  padding: "16px",
                                                                                                                                  display: "flex",
                                                                                                                                  alignItems: "center",
                                                                                                                                  gap: "14px",
                                                                                                                                  transition: "border-color 0.2s"
                                                                                                            }}
                                                                                                      >
                                                                                    {/* Imagen placeholder */}
                                                                                                    <div style={{
                                                                                                                                width: "80px", height: "80px", borderRadius: "10px",
                                                                                                                                backgroundColor: "var(--surface-2)",
                                                                                                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                                                                                                fontSize: "28px", flexShrink: 0
                                                                                                          }}>
                                                                                                                          🍔
                                                                                                        </div>div>
                                                                                
                                                                                    {/* Info */}
                                                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                                                                          <div style={{
                                                                                                                                  fontWeight: 700, fontSize: "15px",
                                                                                                                                  color: "var(--text-primary)",
                                                                                                                                  marginBottom: "4px"
                                                                                                          }}>
                                                                                                                              {product.name}
                                                                                                                              </div>div>
                                                                                                                          <div style={{
                                                                                                                                  fontSize: "12px", color: "var(--text-secondary)",
                                                                                                                                  lineHeight: 1.4, marginBottom: "10px",
                                                                                                                                  overflow: "hidden", display: "-webkit-box",
                                                                                                                                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical"
                                                                                                          }}>
                                                                                                                              {product.description}
                                                                                                                              </div>div>
                                                                                                                          <div style={{
                                                                                                                                  fontWeight: 700, fontSize: "15px",
                                                                                                                                  color: "var(--brand-accent)"
                                                                                                          }}>
                                                                                                                              {euros(product.basePriceCents)}
                                                                                                                              </div>div>
                                                                                                        </div>div>
                                                                                
                                                                                    {/* CTA */}
                                                                                                    <div style={{ flexShrink: 0 }}>
                                                                                                        {qty === 0 ? (
                                                                                                                                  <button
                                                                                                                                                                onClick={() => addItem({ id: product.id, name: product.name, price: product.basePriceCents })}
                                                                                                                                                                style={{
                                                                                                                                                                                                width: "38px", height: "38px", borderRadius: "50%",
                                                                                                                                                                                                backgroundColor: "var(--brand-accent)", border: "none",
                                                                                                                                                                                                color: "#0d0d0d", fontSize: "22px", fontWeight: 700,
                                                                                                                                                                                                cursor: "pointer", display: "flex",
                                                                                                                                                                                                alignItems: "center", justifyContent: "center",
                                                                                                                                                                                                lineHeight: 1
                                                                                                                                                                                                                              }}
                                                                                                                                                              >
                                                                                                                                                            +
                                                                                                                                      </button>button>
                                                                                                                                ) : (
                                                                                                                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                                                                                                                            <button
                                                                                                                                                                                            onClick={() => removeItem(product.id)}
                                                                                                                                                                                            style={{
                                                                                                                                                                                                                              width: "32px", height: "32px", borderRadius: "50%",
                                                                                                                                                                                                                              backgroundColor: "var(--surface-2)", border: "1px solid var(--border)",
                                                                                                                                                                                                                              color: "var(--text-primary)", fontSize: "18px", fontWeight: 700,
                                                                                                                                                                                                                              cursor: "pointer", display: "flex",
                                                                                                                                                                                                                              alignItems: "center", justifyContent: "center"
                                                                                                                                                                                                                                                              }}
                                                                                                                                                                                          >
                                                                                                                                                                                        −
                                                                                                                                                                </button>button>
                                                                                                                                                            <span style={{ fontWeight: 700, minWidth: "16px", textAlign: "center", color: "var(--brand-accent)" }}>
                                                                                                                                                                {qty}
                                                                                                                                                                </span>span>
                                                                                                                                                            <button
                                                                                                                                                                                            onClick={() => addItem({ id: product.id, name: product.name, price: product.basePriceCents })}
                                                                                                                                                                                            style={{
                                                                                                                                                                                                                              width: "32px", height: "32px", borderRadius: "50%",
                                                                                                                                                                                                                              backgroundColor: "var(--brand-accent)", border: "none",
                                                                                                                                                                                                                              color: "#0d0d0d", fontSize: "18px", fontWeight: 700,
                                                                                                                                                                                                                              cursor: "pointer", display: "flex",
                                                                                                                                                                                                                              alignItems: "center", justifyContent: "center"
                                                                                                                                                                                                                                                              }}
                                                                                                                                                                                          >
                                                                                                                                                                                        +
                                                                                                                                                                </button>button>
                                                                                                                                      </div>div>
                                                                                                                          )}
                                                                                                        </div>div>
                                                                                </div>div>
                                                                              );
                                      })}
                                    </div>div>
                        </section>section>
                      ))}
                </main>main>
          
              {/* BARRA CARRITO */}
              {totalItems > 0 && (
                      <div style={{
                                    position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60,
                                    padding: "12px 16px",
                                    backgroundColor: "var(--surface-0)",
                                    borderTop: "1px solid var(--border)"
                      }}>
                                <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", gap: "10px", alignItems: "center" }}>
                                            <button
                                                              onClick={clearCart}
                                                              style={{
                                                                                  padding: "12px 18px", borderRadius: "12px",
                                                                                  backgroundColor: "var(--surface-1)",
                                                                                  border: "1px solid var(--border)",
                                                                                  color: "var(--text-secondary)", fontSize: "14px",
                                                                                  cursor: "pointer", flexShrink: 0
                                                              }}
                                                            >
                                                          Vaciar
                                            </button>button>
                                            <a
                                                              href={`/pedir/${tenant}/checkout`}
                                                              style={{
                                                                                  flex: 1, display: "flex", alignItems: "center",
                                                                                  justifyContent: "space-between",
                                                                                  backgroundColor: "var(--brand-accent)",
                                                                                  borderRadius: "12px", padding: "13px 20px",
                                                                                  textDecoration: "none", color: "#0d0d0d",
                                                                                  fontWeight: 700, fontSize: "15px"
                                                              }}
                                                            >
                                                          <span style={{
                                                                                backgroundColor: "rgba(0,0,0,0.15)",
                                                                                borderRadius: "8px", padding: "2px 9px",
                                                                                fontSize: "13px", fontWeight: 800
                                                            }}>
                                                              {totalItems}
                                                          </span>span>
                                                          <span>Ver pedido</span>span>
                                                          <span>{euros(totalCents)}</span>span>
                                            </a>a>
                                </div>div>
                      </div>div>
                )}
          </div>div>
        );
}</div>
