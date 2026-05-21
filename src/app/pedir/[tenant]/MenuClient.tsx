"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/store/cart";

type MenuProduct = { id: string; name: string; description?: string | null; basePriceCents: number; imageUrl?: string | null; };
type MenuCategory = { id: string; name: string; slug: string; products: MenuProduct[]; };
type MenuClientProps = { tenant: string; tenantName: string; categories: MenuCategory[]; };

const euros = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

function Modal({ product, onClose, onAdd, qty, onInc, onDec }: { product: MenuProduct; onClose: () => void; onAdd: () => void; qty: number; onInc: () => void; onDec: () => void; }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, backgroundColor: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "520px", overflow: "hidden" }}>
        <div style={{ backgroundColor: "#f5f0e8", width: "100%", height: "260px", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ fontSize: "48px", color: "#bbb" }}>?</div>
          }
          <button onClick={onClose} style={{ position: "absolute", top: "12px", right: "12px", width: "32px", height: "32px", borderRadius: "50%", backgroundColor: "rgba(0,0,0,0.35)", border: "none", color: "#fff", fontSize: "18px", cursor: "pointer" }}>X</button>
        </div>
        <div style={{ padding: "20px 24px 32px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#1a1a1a", margin: "0 0 8px", textTransform: "uppercase" }}>{product.name}</h2>
          {product.description && <p style={{ fontSize: "14px", color: "#666", margin: "0 0 12px", lineHeight: 1.5 }}>{product.description}</p>}
          <p style={{ fontSize: "20px", fontWeight: 700, color: "#c8102e", margin: "0 0 20px" }}>{euros(product.basePriceCents)}</p>
          {qty === 0
            ? <button onClick={onAdd} style={{ width: "100%", padding: "14px", borderRadius: "999px", backgroundColor: "#c8102e", border: "none", color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>Anadir al pedido</button>
            : <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "#c8102e", borderRadius: "999px", padding: "4px" }}>
                <button onClick={onDec} style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "#fff", border: "none", color: "#c8102e", fontSize: "22px", fontWeight: 700, cursor: "pointer" }}>-</button>
                <span style={{ color: "#fff", fontWeight: 700, fontSize: "18px" }}>{qty}</span>
                <button onClick={onInc} style={{ width: "44px", height: "44px", borderRadius: "50%", backgroundColor: "#fff", border: "none", color: "#c8102e", fontSize: "22px", fontWeight: 700, cursor: "pointer" }}>+</button>
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
    <div style={{ minHeight: "100vh", backgroundColor: "#fff", color: "#1a1a1a", fontFamily: "system-ui, sans-serif" }}>
      <header style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: "#fff", borderBottom: "1px solid #e8e8e8", height: "64px", display: "flex", alignItems: "center", padding: "0 20px", gap: "12px" }}>
        <div style={{ width: "40px", height: "40px", borderRadius: "10px", backgroundColor: "#c8102e", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "15px", color: "#fff", flexShrink: 0 }}>{tenantName.slice(0, 2).toUpperCase()}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: "17px", color: "#1a1a1a" }}>{tenantName}</div>
          <div style={{ fontSize: "12px", color: "#888" }}>A domicilio o recoger</div>
        </div>
        {totalItems > 0 && <a href={"/pedir/" + tenant + "/checkout"} style={{ marginLeft: "auto", backgroundColor: "#c8102e", color: "#fff", borderRadius: "999px", padding: "8px 18px", fontWeight: 700, fontSize: "14px", textDecoration: "none" }}>{totalItems} art. - {euros(totalCents)}</a>}
      </header>
      <div style={{ backgroundColor: "#1a0a00", padding: "18px 20px", textAlign: "center" }}>
        <h1 style={{ margin: 0, color: "#fff", fontSize: "28px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.5px" }}>Nuestra carta</h1>
      </div>
      <nav ref={navRef} style={{ position: "sticky", top: "64px", zIndex: 40, backgroundColor: "#fff", borderBottom: "1px solid #e8e8e8", display: "flex", overflowX: "auto", scrollbarWidth: "none" }}>
        {categories.map((cat) => {
          const isActive = active === cat.slug;
          const thumb = cat.products.find((p) => p.imageUrl)?.imageUrl;
          return (
            <button key={cat.slug} data-slug={cat.slug} onClick={() => secRefs.current[cat.slug]?.scrollIntoView({ behavior: "smooth", block: "start" })}
              style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 16px 8px", border: "none", backgroundColor: "transparent", borderBottom: isActive ? "3px solid #c8102e" : "3px solid transparent", cursor: "pointer", minWidth: "80px" }}>
              <div style={{ width: "52px", height: "52px", borderRadius: "50%", backgroundColor: isActive ? "#fff0f0" : "#f5f5f5", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", border: isActive ? "2px solid #c8102e" : "2px solid transparent" }}>
                {thumb
                  ? <img src={thumb} alt={cat.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ fontSize: "18px", color: "#aaa" }}>?</span>
                }
              </div>
              <span style={{ fontSize: "11px", fontWeight: isActive ? 700 : 500, color: isActive ? "#c8102e" : "#555", textAlign: "center", textTransform: "uppercase", letterSpacing: "0.3px" }}>{cat.name}</span>
            </button>
          );
        })}
      </nav>
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px 20px 140px" }}>
        {categories.map((cat) => (
          <section key={cat.slug} ref={(el) => { secRefs.current[cat.slug] = el; }} style={{ marginBottom: "48px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: 900, color: "#1a0a00", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 20px", paddingBottom: "10px", borderBottom: "2px solid #e8e8e8" }}>{cat.name}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" }}>
              {cat.products.map((p) => (
                <div key={p.id} onClick={() => setSelected(p)} style={{ backgroundColor: "#fff", borderRadius: "12px", border: getQty(p.id) > 0 ? "2px solid #c8102e" : "2px solid #e8e8e8", overflow: "hidden", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", position: "relative" }}>
                  <div style={{ width: "100%", paddingTop: "75%", position: "relative", backgroundColor: "#f5f0e8" }}>
                    {p.imageUrl
                      ? <img src={p.imageUrl} alt={p.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "40px", color: "#ccc" }}>?</div>
                    }
                    {getQty(p.id) > 0 && <div style={{ position: "absolute", top: "8px", right: "8px", backgroundColor: "#c8102e", color: "#fff", borderRadius: "50%", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "13px" }}>{getQty(p.id)}</div>}
                  </div>
                  <div style={{ padding: "12px 14px 14px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: "13px", fontWeight: 700, color: "#1a0a00", textTransform: "uppercase", lineHeight: 1.3 }}>{p.name}</p>
                    {p.description && <p style={{ margin: "0 0 8px", fontSize: "12px", color: "#888", lineHeight: 1.4, maxHeight: "38px", overflow: "hidden" }}>{p.description}</p>}
                    <p style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#c8102e" }}>{euros(p.basePriceCents)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
      {totalItems > 0 && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 60, backgroundColor: "#fff", borderTop: "1px solid #e8e8e8", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 -4px 16px rgba(0,0,0,0.08)" }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#1a1a1a" }}>Tu pedido</span>
            <span style={{ color: "#888", fontSize: "14px", marginLeft: "8px" }}>{totalItems} {totalItems === 1 ? "articulo" : "articulos"}</span>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button onClick={clear} style={{ padding: "8px 14px", borderRadius: "999px", border: "1px solid #ddd", backgroundColor: "#fff", color: "#555", fontSize: "13px", cursor: "pointer" }}>Vaciar</button>
            <a href={"/pedir/" + tenant + "/checkout"} style={{ padding: "10px 22px", borderRadius: "999px", backgroundColor: "#c8102e", color: "#fff", fontWeight: 700, fontSize: "15px", textDecoration: "none" }}>Ver pedido {euros(totalCents)}</a>
          </div>
        </div>
      )}
      {selected && <Modal product={selected} onClose={() => setSelected(null)} onAdd={() => doAdd(selected)} qty={getQty(selected.id)} onInc={() => doInc(selected)} onDec={() => doDec(selected)} />}
    </div>
  );
}
