"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/store/cart";

type MenuProduct = { id: string; name: string; description?: string | null; basePriceCents: number; imageUrl?: string | null; };
type MenuCategory = { id: string; name: string; slug: string; products: MenuProduct[]; };
type MenuClientProps = { tenant: string; tenantName: string; categories: MenuCategory[]; };

const euros = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

function Modal({ product, onClose, onAdd, qty, onInc, onDec }: {
  product: MenuProduct; onClose: () => void; onAdd: () => void;
  qty: number; onInc: () => void; onDec: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "540px", overflow: "hidden", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ backgroundColor: "#502314", width: "100%", minHeight: "280px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} style={{ width: "100%", maxHeight: "280px", objectFit: "contain" }} />
            : <div style={{ fontSize: "80px", color: "rgba(255,255,255,0.15)" }}>?</div>
          }
          <button onClick={onClose} style={{ position: "absolute", top: "16px", right: "16px", width: "36px", height: "36px", borderRadius: "50%", backgroundColor: "rgba(255,255,255,0.2)", border: "none", color: "#fff", fontSize: "20px", cursor: "pointer", fontWeight: 700 }}>x</button>
        </div>
        <div style={{ padding: "24px 28px 36px", backgroundColor: "#fff" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "#502314", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.5px", lineHeight: 1.2 }}>{product.name}</h2>
          {product.description && <p style={{ fontSize: "15px", color: "#9f816f", margin: "0 0 14px", lineHeight: 1.5 }}>{product.description}</p>}
          <p style={{ fontSize: "22px", fontWeight: 700, color: "#d62300", margin: "0 0 22px" }}>{euros(product.basePriceCents)}</p>
          {qty === 0
            ? <button onClick={onAdd} style={{ width: "100%", padding: "15px", borderRadius: "9999px", backgroundColor: "#d62300", border: "none", color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.5px" }}>Anadir al pedido</button>
            : <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#d62300", borderRadius: "9999px", padding: "5px" }}>
                <button onClick={onDec} style={{ width: "46px", height: "46px", borderRadius: "50%", backgroundColor: "#fff", border: "none", color: "#d62300", fontSize: "24px", fontWeight: 700, cursor: "pointer" }}>-</button>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "20px" }}>{qty}</span>
                <button onClick={onInc} style={{ width: "46px", height: "46px", borderRadius: "50%", backgroundColor: "#fff", border: "none", color: "#d62300", fontSize: "24px", fontWeight: 700, cursor: "pointer" }}>+</button>
              </div>
          }
        </div>
      </div>
    </div>
  );
}
export default function MenuClient({ tenant, tenantName, categories }: MenuClientProps) {
  const { items, addItem, inc, dec, remove, clear } = useCart();
  const [active, setActive] = useState(categories[0]?.slug ?? "");
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const secRefs = useRef<Record<string, HTMLElement | null>>({});

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const getQty = (id: string) => items.find((i) => i.productId === id)?.quantity ?? 0;
  const getLid = (id: string) => items.find((i) => i.productId === id)?.id ?? null;

  useEffect(() => {
    const obs: IntersectionObserver[] = [];
    categories.forEach((cat) => {
      const el = secRefs.current[cat.slug];
      if (!el) return;
      const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) setActive(cat.slug); }, { rootMargin: "-80px 0px -60% 0px" });
      o.observe(el); obs.push(o);
    });
    return () => obs.forEach((o) => o.disconnect());
  }, [categories]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const btn = nav.querySelector('[data-slug="' + active + '"]') as HTMLElement | null;
    if (btn) nav.scrollTo({ left: btn.offsetLeft - nav.offsetWidth / 2 + btn.offsetWidth / 2, behavior: "smooth" });
  }, [active]);

  const doAdd = (p: MenuProduct) => addItem({ productId: p.id, name: p.name, unitPriceCents: p.basePriceCents, quantity: 1 });
  const doInc = (p: MenuProduct) => { const id = getLid(p.id); if (id) inc(id); };
  const doDec = (p: MenuProduct) => { const id = getLid(p.id); if (!id) return; if (getQty(p.id) <= 1) remove(id); else dec(id); };
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#fff", fontFamily: "system-ui, sans-serif" }}>

      <header style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: "#fff", borderBottom: "1px solid #eee", height: "68px", display: "flex", alignItems: "center", padding: "0 24px", gap: "14px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <div style={{ width: "44px", height: "44px", borderRadius: "12px", backgroundColor: "#d62300", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "16px", color: "#fff", flexShrink: 0, letterSpacing: "0.5px" }}>{tenantName.slice(0, 2).toUpperCase()}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "18px", color: "#502314", letterSpacing: "0.3px" }}>{tenantName}</div>
          <div style={{ fontSize: "12px", color: "#9f816f" }}>A domicilio o recoger</div>
        </div>
        {totalItems > 0 && (
          <a href={"/pedir/" + tenant + "/checkout"} style={{ marginLeft: "auto", backgroundColor: "#d62300", color: "#fff", borderRadius: "9999px", padding: "10px 22px", fontWeight: 700, fontSize: "14px", textDecoration: "none", whiteSpace: "nowrap" }}>
            {totalItems} art. - {euros(totalCents)}
          </a>
        )}
      </header>

      <div style={{ backgroundColor: "#502314", padding: "22px 24px", textAlign: "center" }}>
        <h1 style={{ margin: 0, color: "#f5ebdc", fontSize: "32px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.5px", lineHeight: 1 }}>Nuestra carta</h1>
      </div>

      <div ref={navRef} style={{ position: "sticky", top: "68px", zIndex: 40, backgroundColor: "#fff", borderBottom: "1px solid #eee", display: "flex", overflowX: "auto", scrollbarWidth: "none", boxShadow: "0 2px 4px rgba(0,0,0,0.04)" }}>
        {categories.map((cat) => {
          const isActive = active === cat.slug;
          const thumb = cat.products.find((p) => p.imageUrl)?.imageUrl;
          return (
            <button key={cat.slug} data-slug={cat.slug}
              onClick={() => secRefs.current[cat.slug]?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "16px 14px 12px", border: "none", backgroundColor: "transparent", borderBottom: isActive ? "3px solid #d62300" : "3px solid transparent", cursor: "pointer", minWidth: "90px" }}>
              <div style={{ width: "56px", height: "36px", borderRadius: "10px", backgroundColor: isActive ? "#fff0ec" : "#f7f2ef", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {thumb
                  ? <img src={thumb} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: "20px", color: "#ccc" }}>?</span>
                }
              </div>
              <span style={{ fontSize: "11px", fontWeight: 700, color: isActive ? "#d62300" : "#502314", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.2px", lineHeight: 1.2, maxWidth: "80px" }}>{cat.name}</span>
            </button>
          );
        })}
      </div>
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "36px 24px 160px" }}>
        {categories.map((cat) => (
          <section key={cat.slug} ref={(el) => { secRefs.current[cat.slug] = el; }} style={{ marginBottom: "56px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#502314", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 20px", paddingBottom: "12px", borderBottom: "2px solid #f0e8e4" }}>{cat.name}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
              {cat.products.map((p) => {
                const inCart = getQty(p.id) > 0;
                return (
                  <div key={p.id} onClick={() => setSelected(p)}
                    style={{ backgroundColor: "#fff", borderRadius: "10px", border: "none", overflow: "hidden", cursor: "pointer",
                      boxShadow: inCart ? "rgba(214,35,0,0.25) 0px 0px 0px 2px, rgba(73,73,73,0.15) 0px 2px 8px 0px" : "rgba(73,73,73,0.2) 0px 0px 4px 0px",
                      transition: "box-shadow 0.3s", position: "relative" }}>
                    <div style={{ width: "100%", paddingTop: "65%", position: "relative", backgroundColor: "#fff" }}>
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt={p.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", padding: "8px" }} />
                        : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "48px", color: "#e8d8d0" }}>?</div>
                      }
                      {inCart && (
                        <div style={{ position: "absolute", top: "8px", right: "8px", backgroundColor: "#d62300", color: "#fff", borderRadius: "50%", width: "24px", height: "24px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px" }}>
                          {getQty(p.id)}
                        </div>
                      )}
                    </div>
                    <div style={{ padding: "14px 16px 16px", borderTop: "1px solid #f5f0ec" }}>
                      <p style={{ margin: "0 0 6px", fontSize: "14px", fontWeight: 700, color: "#502314", textTransform: "uppercase", lineHeight: 1.25, letterSpacing: "0.3px" }}>{p.name}</p>
                      <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#d62300" }}>{euros(p.basePriceCents)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>
      {totalItems > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60, backgroundColor: "#fff", borderTop: "1px solid #eee", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 20px rgba(0,0,0,0.1)" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#502314" }}>Tu pedido</span>
            <span style={{ color: "#9f816f", fontSize: "13px", marginLeft: "8px" }}>{totalItems} {totalItems === 1 ? "articulo" : "articulos"}</span>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button onClick={clear} style={{ padding: "9px 16px", borderRadius: "9999px", border: "1px solid #e0d5cf", backgroundColor: "#fff", color: "#9f816f", fontSize: "13px", cursor: "pointer", fontWeight: 600 }}>Vaciar</button>
            <a href={"/pedir/" + tenant + "/checkout"} style={{ padding: "11px 24px", borderRadius: "9999px", backgroundColor: "#d62300", color: "#fff", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>Ver pedido {euros(totalCents)}</a>
          </div>
        </div>
      )}

      {selected && (
        <Modal
          product={selected}
          onClose={() => setSelected(null)}
          onAdd={() => doAdd(selected)}
          qty={getQty(selected.id)}
          onInc={() => doInc(selected)}
          onDec={() => doDec(selected)}
        />
      )}
    </div>
  );
      }
