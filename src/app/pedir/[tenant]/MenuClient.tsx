"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/store/cart";

type MenuProduct = {
    id: string;
    name: string;
    description?: string | null;
    basePriceCents: number;
    imageUrl?: string | null;
};

type MenuCategory = {
    id: string;
    name: string;
    slug: string;
    products: MenuProduct[];
};

type MenuClientProps = {
    tenant: string;
    tenantName: string;
    categories: MenuCategory[];
};

const euros = (cents: number) =>
    (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

// ─── Modal de producto ────────────────────────────────────────────────────────
function ProductModal({
    product,
    onClose,
    onAdd,
    qty,
    onInc,
    onDec,
}: {
    product: MenuProduct;
    onClose: () => void;
    onAdd: () => void;
    qty: number;
    onInc: () => void;
    onDec: () => void;
}) {
    useEffect(() => {
          const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
          document.addEventListener("keydown", handler);
          return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

  return (
        <div
                onClick={onClose}
                style={{
                          position: "fixed", inset: 0, zIndex: 100,
                          backgroundColor: "rgba(0,0,0,0.55)",
                          display: "flex", alignItems: "flex-end", justifyContent: "center",
                }}
              >
              <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                                    backgroundColor: "#fff", borderRadius: "20px 20px 0 0",
                                    width: "100%", maxWidth: "520px",
                                    padding: "0 0 32px 0", overflow: "hidden",
                        }}
                      >
                {/* Imagen */}
                      <div style={{ backgroundColor: "#f5f0e8", width: "100%", height: "260px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                        {product.imageUrl ? (
                                    <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  ) : (
                                    <div style={{ fontSize: "72px" }}>🍽️</div>div>
                                )}
                                <button
                                              onClick={onClose}
                                              style={{
                                                              position: "absolute", top: "12px", right: "12px",
                                                              width: "32px", height: "32px", borderRadius: "50%",
                                                              backgroundColor: "rgba(0,0,0,0.35)", border: "none", color: "#fff",
                                                              fontSize: "18px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                                              }}
                                            >×</button>button>
                      </div>div>
              
                {/* Info */}
                      <div style={{ padding: "20px 24px 0" }}>
                                <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#1a1a1a", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "-0.3px" }}>
                                  {product.name}
                                </h2>h2>
                        {product.description && (
                                    <p style={{ fontSize: "14px", color: "#666", margin: "0 0 16px", lineHeight: 1.5 }}>
                                      {product.description}
                                    </p>p>
                                )}
                                <p style={{ fontSize: "20px", fontWeight: 700, color: "#c8102e", margin: "0 0 20px" }}>
                                  {euros(product.basePriceCents)}
                                </p>p>
                      
                        {/* Controles */}
                        {qty === 0 ? (
                                    <button
                                                    onClick={onAdd}
                                                    style={{
                                                                      width: "100%", padding: "14px", borderRadius: "999px",
                                                                      backgroundColor: "#c8102e", border: "none", color: "#fff",
                                                                      fontSize: "16px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase",
                                                    }}
                                                  >
                                                  Añadir al pedido
                                    </button>button>
                                  ) : (
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#c8102e", borderRadius: "999px", padding: "4px" }}>
                                                  <button
                                                                    onClick={onDec}
                                                                    style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "#fff", border: "none", color: "#c8102e", fontSize: "22px", fontWeight: 700, cursor: "pointer" }}
                                                                  >−</button>button>
                                                  <span style={{ color: "#fff", fontWeight: 700, fontSize: "18px" }}>{qty}</span>span>
                                                  <button
                                                                    onClick={onInc}
                                                                    style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "#fff", border: "none", color: "#c8102e", fontSize: "22px", fontWeight: 700, cursor: "pointer" }}
                                                                  >+</button>button>
                                    </div>div>
                                )}
                      </div>div>
              </div>div>
        </div>div>
      );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function MenuClient({ tenant, tenantName, categories }: MenuClientProps) {
    const { items, addItem, inc, dec, remove, clear } = useCart();
    const [activeCategory, setActiveCategory] = useState(categories[0]?.slug ?? "");
    const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);
    const navRef = useRef<HTMLDivElement>(null);
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  
    const totalItems = items.reduce((s, i) => s + i.quantity, 0);
    const totalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  
    const getQty = (productId: string) => items.find((i) => i.productId === productId)?.quantity ?? 0;
    const getLineId = (productId: string) => items.find((i) => i.productId === productId)?.id ?? null;
  
    const scrollToCategory = (slug: string) => {
          sectionRefs.current[slug]?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  
    // Scroll activo
    useEffect(() => {
          const observers: IntersectionObserver[] = [];
          categories.forEach((cat) => {
                  const el = sectionRefs.current[cat.slug];
                  if (!el) return;
                  const obs = new IntersectionObserver(
                            ([entry]) => { if (entry.isIntersecting) setActiveCategory(cat.slug); },
                    { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
                          );
                  obs.observe(el);
                  observers.push(obs);
          });
          return () => observers.forEach((o) => o.disconnect());
    }, [categories]);
  
    // Scroll nav activo al centro
    useEffect(() => {
          const nav = navRef.current;
          if (!nav) return;
          const activeBtn = nav.querySelector(`[data-slug="${activeCategory}"]`) as HTMLElement;
          if (activeBtn) {
                  const navWidth = nav.offsetWidth;
                  const btnLeft = activeBtn.offsetLeft;
                  const btnWidth = activeBtn.offsetWidth;
                  nav.scrollTo({ left: btnLeft - navWidth / 2 + btnWidth / 2, behavior: "smooth" });
          }
    }, [activeCategory]);
  
    const handleProductClick = (product: MenuProduct) => setSelectedProduct(product);
  
    const handleAdd = (product: MenuProduct) => {
          addItem({ productId: product.id, name: product.name, unitPriceCents: product.basePriceCents, quantity: 1 });
    };
  
    const handleInc = (product: MenuProduct) => {
          const lineId = getLineId(product.id);
          if (lineId) inc(lineId);
    };
  
    const handleDec = (product: MenuProduct) => {
          const lineId = getLineId(product.id);
          if (!lineId) return;
          const qty = getQty(product.id);
          if (qty <= 1) remove(lineId); else dec(lineId);
    };
  
    const initials = tenantName.slice(0, 2).toUpperCase();
  
    return (
          <div style={{ minHeight: "100vh", backgroundColor: "#fff", color: "#1a1a1a", fontFamily: "system-ui, sans-serif" }}>
          
            {/* ── Header ─────────────────────────────────────────────────────────── */}
                <header style={{
                    position: "sticky", top: 0, zIndex: 50,
                    backgroundColor: "#fff", borderBottom: "1px solid #e8e8e8",
                    height: "64px", display: "flex", alignItems: "center",
                    padding: "0 20px", gap: "12px",
          }}>
                        <div style={{
                      width: "40px", height: "40px", borderRadius: "10px",
                      backgroundColor: "#c8102e", display: "flex", alignItems: "center",
                      justifyContent: "center", fontWeight: 800, fontSize: "15px",
                      color: "#fff", flexShrink: 0,
          }}>
                          {initials}
                        </div>div>
                        <div>
                                  <div style={{ fontWeight: 700, fontSize: "17px", color: "#1a1a1a", lineHeight: 1.2 }}>{tenantName}</div>div>
                                  <div style={{ fontSize: "12px", color: "#888" }}>A domicilio o recoger</div>div>
                        </div>div>
                  {/* Carrito compacto en header */}
                  {totalItems > 0 && (
                      <a
                                    href={`/pedir/${tenant}/checkout`}
                                    style={{
                                                    marginLeft: "auto", backgroundColor: "#c8102e", color: "#fff",
                                                    border: "none", borderRadius: "999px", padding: "8px 18px",
                                                    fontWeight: 700, fontSize: "14px", cursor: "pointer",
                                                    textDecoration: "none", display: "flex", alignItems: "center", gap: "8px",
                                    }}
                                  >
                                  🛒 {totalItems} · {euros(totalCents)}
                      </a>a>
                        )}
                </header>header>
          
            {/* ── Banner título ───────────────────────────────────────────────────── */}
                <div style={{
                    backgroundColor: "#1a0a00", padding: "18px 20px",
                    textAlign: "center",
          }}>
                        <h1 style={{
                      margin: 0, color: "#fff", fontSize: "28px",
                      fontWeight: 900, letterSpacing: "-0.5px", textTransform: "uppercase",
          }}>
                                  Nuestra carta
                        </h1>h1>
                </div>div>
          
            {/* ── Nav categorías con imagen + texto ──────────────────────────────── */}
                <nav
                          ref={navRef}
                          style={{
                                      position: "sticky", top: "64px", zIndex: 40,
                                      backgroundColor: "#fff", borderBottom: "1px solid #e8e8e8",
                                      display: "flex", gap: "0", overflowX: "auto",
                                      scrollbarWidth: "none", padding: "0",
                          }}
                        >
                  {categories.map((cat) => {
                                    const isActive = activeCategory === cat.slug;
                                    const firstImg = cat.products.find((p) => p.imageUrl)?.imageUrl;
                                    return (
                                                  <button
                                                                  key={cat.slug}
                                                                  data-slug={cat.slug}
                                                                  onClick={() => scrollToCategory(cat.slug)}
                                                                  style={{
                                                                                    flexShrink: 0, display: "flex", flexDirection: "column",
                                                                                    alignItems: "center", gap: "4px", padding: "10px 16px 8px",
                                                                                    border: "none", backgroundColor: "transparent",
                                                                                    borderBottom: isActive ? "3px solid #c8102e" : "3px solid transparent",
                                                                                    cursor: "pointer", minWidth: "80px",
                                                                  }}
                                                                >
                                                    {/* Thumbnail categoría */}
                                                                <div style={{
                                                                                  width: "52px", height: "52px", borderRadius: "50%",
                                                                                  backgroundColor: isActive ? "#fff0f0" : "#f5f5f5",
                                                                                  overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                                                                                  border: isActive ? "2px solid #c8102e" : "2px solid transparent",
                                                                }}>
                                                                  {firstImg ? (
                                                                                    <img src={firstImg} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                                                                  ) : (
                                                                                    <span style={{ fontSize: "22px" }}>🍽️</span>span>
                                                                                )}
                                                                </div>div>
                                                                <span style={{
                                                                                  fontSize: "11px", fontWeight: isActive ? 700 : 500,
                                                                                  color: isActive ? "#c8102e" : "#555",
                                                                                  textAlign: "center", lineHeight: 1.2, maxWidth: "72px",
                                                                                  textTransform: "uppercase", letterSpacing: "0.3px",
                                                                }}>
                                                                  {cat.name}
                                                                </span>span>
                                                  </button>button>
                                                );
                        })}
                </nav>nav>
          
            {/* ── Contenido principal ─────────────────────────────────────────────── */}
                <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 20px 120px" }}>
                  {categories.map((cat) => (
                      <section
                                    key={cat.slug}
                                    ref={(el) => { sectionRefs.current[cat.slug] = el; }}
                                    style={{ marginBottom: "48px" }}
                                  >
                        {/* Título sección */}
                                  <h2 style={{
                                                  fontSize: "22px", fontWeight: 900, color: "#1a0a00",
                                                  textTransform: "uppercase", letterSpacing: "0.5px",
                                                  margin: "0 0 20px", paddingBottom: "10px",
                                                  borderBottom: "2px solid #e8e8e8",
                                  }}>
                                    {cat.name}
                                  </h2>h2>
                      
                        {/* Grid 3 columnas */}
                                  <div style={{
                                                  display: "grid",
                                                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                                                  gap: "16px",
                                  }}>
                                    {cat.products.map((product) => {
                                                    const qty = getQty(product.id);
                                                    return (
                                                                        <div
                                                                                              key={product.id}
                                                                                              onClick={() => handleProductClick(product)}
                                                                                              style={{
                                                                                                                      backgroundColor: "#fff", borderRadius: "12px",
                                                                                                                      border: qty > 0 ? "2px solid #c8102e" : "2px solid #e8e8e8",
                                                                                                                      overflow: "hidden", cursor: "pointer",
                                                                                                                      transition: "box-shadow 0.15s, transform 0.1s",
                                                                                                                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                                                                                                                      position: "relative",
                                                                                                }}
                                                                                              onMouseEnter={(e) => {
                                                                                                                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)";
                                                                                                                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                                                                                                }}
                                                                                              onMouseLeave={(e) => {
                                                                                                                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)";
                                                                                                                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                                                                                                }}
                                                                                            >
                                                                          {/* Imagen */}
                                                                                            <div style={{
                                                                                                                    width: "100%", paddingTop: "75%", position: "relative",
                                                                                                                    backgroundColor: "#f5f0e8", overflow: "hidden",
                                                                                              }}>
                                                                                              {product.imageUrl ? (
                                                                                                                      <img
                                                                                                                                                  src={product.imageUrl}
                                                                                                                                                  alt={product.name}
                                                                                                                                                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                                                                                                                                                />
                                                                                                                    ) : (
                                                                                                                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px" }}>
                                                                                                                                                🍽️
                                                                                                                        </div>div>
                                                                                                                  )}
                                                                                              {/* Badge cantidad */}
                                                                                              {qty > 0 && (
                                                                                                                      <div style={{
                                                                                                                                                  position: "absolute", top: "8px", right: "8px",
                                                                                                                                                  backgroundColor: "#c8102e", color: "#fff", borderRadius: "50%",
                                                                                                                                                  width: "26px", height: "26px", display: "flex",
                                                                                                                                                  alignItems: "center", justifyContent: "center",
                                                                                                                                                  fontWeight: 700, fontSize: "13px",
                                                                                                                        }}>
                                                                                                                        {qty}
                                                                                                                        </div>div>
                                                                                                                  )}
                                                                                              </div>div>
                                                                        
                                                                          {/* Info */}
                                                                                            <div style={{ padding: "12px 14px 14px" }}>
                                                                                                                  <p style={{
                                                                                                                      margin: "0 0 4px", fontSize: "13px", fontWeight: 700,
                                                                                                                      color: "#1a0a00", textTransform: "uppercase",
                                                                                                                      letterSpacing: "0.2px", lineHeight: 1.3,
                                                                                              }}>
                                                                                                                    {product.name}
                                                                                                                    </p>p>
                                                                                              {product.description && (
                                                                                                                      <p style={{
                                                                                                                                                  margin: "0 0 8px", fontSize: "12px", color: "#888",
                                                                                                                                                  lineHeight: 1.4, overflow: "hidden",
                                                                                                                                                  display: "-webkit-box", WebkitLineClamp: 2,
                                                                                                                                                  WebkitBoxOrient: "vertical" as const,
                                                                                                                        }}>
                                                                                                                        {product.description}
                                                                                                                        </p>p>
                                                                                                                  )}
                                                                                                                  <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#c8102e" }}>
                                                                                                                    {euros(product.basePriceCents)}
                                                                                                                    </p>p>
                                                                                              </div>div>
                                                                        </div>div>
                                                                      );
                                  })}
                                  </div>div>
                      </section>section>
                    ))}
                </main>main>
          
            {/* ── Barra carrito bottom ─────────────────────────────────────────────── */}
            {totalItems > 0 && (
                    <div style={{
                                position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60,
                                backgroundColor: "#fff", borderTop: "1px solid #e8e8e8",
                                padding: "12px 20px", display: "flex", alignItems: "center",
                                justifyContent: "space-between", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
                    }}>
                              <div>
                                          <span style={{ fontWeight: 700, fontSize: "15px", color: "#1a1a1a" }}>Tu pedido</span>span>
                                          <span style={{ color: "#888", fontSize: "14px", marginLeft: "8px" }}>
                                            {totalItems} {totalItems === 1 ? "artículo" : "artículos"}
                                          </span>span>
                              </div>div>
                              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                          <button
                                                          onClick={clear}
                                                          style={{
                                                                            padding: "8px 14px", borderRadius: "999px",
                                                                            border: "1px solid #ddd", backgroundColor: "#fff",
                                                                            color: "#555", fontSize: "13px", cursor: "pointer",
                                                          }}
                                                        >
                                                        Vaciar
                                          </button>button>
                                          <a
                                                          href={`/pedir/${tenant}/checkout`}
                                                          style={{
                                                                            padding: "10px 22px", borderRadius: "999px",
                                                                            backgroundColor: "#c8102e", color: "#fff",
                                                                            fontWeight: 700, fontSize: "15px",
                                                                            textDecoration: "none", display: "inline-block",
                                                          }}
                                                        >
                                                        Ver pedido → {euros(totalCents)}
                                          </a>a>
                              </div>div>
                    </div>div>
                )}
          
            {/* ── Modal producto ───────────────────────────────────────────────────── */}
            {selectedProduct && (
                    <ProductModal
                                product={selectedProduct}
                                onClose={() => setSelectedProduct(null)}
                                onAdd={() => { handleAdd(selectedProduct); }}
                                qty={getQty(selectedProduct.id)}
                                onInc={() => handleInc(selectedProduct)}
                                onDec={() => handleDec(selectedProduct)}
                              />
                  )}
          </div>div>
        );
}</div>
