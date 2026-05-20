"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/store/cart";
import ProductDrawer from "./ProductDrawer";

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
    new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(
          (cents ?? 0) / 100
        );

export default function MenuClient({ tenant, tenantName, categories }: MenuClientProps) {
    const { items, addItem, subtotalCents, clear } = useCart();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<MenuProduct | null>(null);
    const [activeSlug, setActiveSlug] = useState(categories[0]?.slug ?? "");
    const navRef = useRef<HTMLDivElement>(null);

  const count = useMemo(() => items.reduce((acc, it) => acc + it.quantity, 0), [items]);
    const subtotal = subtotalCents();

  // Detectar categoría activa al hacer scroll
  useEffect(() => {
        const observer = new IntersectionObserver(
                (entries) => {
                          entries.forEach((entry) => {
                                      if (entry.isIntersecting) {
                                                    setActiveSlug(entry.target.id);
                                      }
                          });
                },
          { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
              );
        categories.forEach((cat) => {
                const el = document.getElementById(cat.slug);
                if (el) observer.observe(el);
        });
        return () => observer.disconnect();
  }, [categories]);

  // Centrar el tab activo en el nav
  useEffect(() => {
        if (!navRef.current) return;
        const btn = navRef.current.querySelector(`[data-slug="${activeSlug}"]`) as HTMLElement;
        if (btn) btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeSlug]);

  const scrollTo = (slug: string) => {
        const el = document.getElementById(slug);
        if (el) {
                const offset = 64 + 52; // header + nav
          const y = el.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top: y, behavior: "smooth" });
        }
  };

  return (
        <>
          {/* ── Header de marca ───────────────────────────────────────────── */}
              <header
                        className="sticky top-0 z-30 flex items-center gap-3 px-4"
                        style={{
                                    background: "var(--surface-1)",
                                    borderBottom: "1px solid var(--border)",
                                    height: "64px",
                        }}
                      >
                {/* Logo placeholder — reemplazar con <Image src={logo} /> */}
                      <div
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                                  style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
                                >
                        {tenantName.slice(0, 2).toUpperCase()}
                      </div>div>
                      <div className="min-w-0">
                                <div className="truncate text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                                  {tenantName}
                                </div>div>
                                <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                            Delivery · Recogida
                                </div>div>
                      </div>div>
              </header>header>
        
          {/* ── Navegación horizontal por categorías (sticky) ─────────────── */}
              <nav
                        ref={navRef}
                        className="sticky z-20 flex gap-1 overflow-x-auto px-3 py-2"
                        style={{
                                    top: "64px",
                                    background: "var(--surface-2)",
                                    borderBottom: "1px solid var(--border)",
                                    scrollbarWidth: "none",
                                    msOverflowStyle: "none",
                        }}
                      >
                {categories.map((cat) => (
                                  <button
                                                key={cat.id}
                                                data-slug={cat.slug}
                                                onClick={() => scrollTo(cat.slug)}
                                                className="shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all"
                                                style={{
                                                                background: activeSlug === cat.slug ? "var(--brand-accent)" : "var(--surface-3)",
                                                                color: activeSlug === cat.slug ? "var(--brand-accent-fg)" : "var(--text-secondary)",
                                                                whiteSpace: "nowrap",
                                                }}
                                              >
                                    {cat.name}
                                  </button>button>
                                ))}
              </nav>nav>
        
          {/* ── Contenido principal ───────────────────────────────────────── */}
              <main className="mx-auto max-w-2xl px-4 pb-32 pt-6">
                      <div className="space-y-10">
                        {categories.map((cat) => (
                      <section key={cat.id} id={cat.slug}>
                        {/* Título de categoría */}
                                    <div className="mb-4 flex items-center gap-3">
                                                    <h2 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
                                                      {cat.name}
                                                    </h2>h2>
                                                    <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                                                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                                      {cat.products.length} productos
                                                    </span>span>
                                    </div>div>
                      
                        {/* Grid de productos */}
                                    <div className="space-y-3">
                                      {cat.products.map((p) => (
                                          <article
                                                                key={p.id}
                                                                className="group flex items-center gap-4 overflow-hidden rounded-2xl p-4 transition-all"
                                                                style={{
                                                                                        background: "var(--surface-1)",
                                                                                        border: "1px solid var(--border)",
                                                                }}
                                                              >
                                            {/* Info del producto */}
                                                              <div className="min-w-0 flex-1">
                                                                                    <div className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>
                                                                                      {p.name}
                                                                                      </div>div>
                                                                {p.description && (
                                                                                        <div
                                                                                                                    className="mt-1 line-clamp-2 text-xs leading-relaxed"
                                                                                                                    style={{ color: "var(--text-secondary)" }}
                                                                                                                  >
                                                                                          {p.description}
                                                                                          </div>div>
                                                                                    )}
                                                                                    <div className="mt-2 text-sm font-bold" style={{ color: "var(--brand-accent)" }}>
                                                                                      {euros(p.basePriceCents)}
                                                                                      </div>div>
                                                              </div>div>
                                          
                                            {/* Imagen placeholder + botón Añadir */}
                                                              <div className="relative shrink-0">
                                                                                    <div
                                                                                                              className="flex h-20 w-20 items-center justify-center rounded-xl text-2xl"
                                                                                                              style={{ background: "var(--surface-2)" }}
                                                                                                            >
                                                                                                            🍔
                                                                                      </div>div>
                                                                                    <button
                                                                                                              onClick={() => { setSelected(p); setOpen(true); }}
                                                                                                              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold shadow-lg transition-transform active:scale-95"
                                                                                                              style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
                                                                                                              aria-label={`Añadir ${p.name}`}
                                                                                                            >
                                                                                                            +
                                                                                      </button>button>
                                                              </div>div>
                                          </article>article>
                                        ))}
                                    </div>div>
                      </section>section>
                    ))}
                      </div>div>
              </main>main>
        
          {/* ── Carrito sticky inferior ───────────────────────────────────── */}
              <div
                        className="fixed bottom-0 left-0 right-0 z-40"
                        style={{ background: "var(--surface-1)", borderTop: "1px solid var(--border)" }}
                      >
                      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
                                <div className="min-w-0">
                                            <div className="text-xs" style={{ color: "var(--text-muted)" }}>Tu pedido</div>div>
                                            <div className="truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                              {count > 0
                                                                ? `${count} ${count === 1 ? "artículo" : "artículos"} · ${euros(subtotal)}`
                                                                : "Carrito vacío"}
                                            </div>div>
                                </div>div>
                                <div className="flex items-center gap-2">
                                  {items.length > 0 ? (
                                      <>
                                                      <button
                                                                          onClick={clear}
                                                                          className="rounded-xl px-3 py-2 text-xs font-medium transition-colors"
                                                                          style={{ background: "var(--surface-3)", color: "var(--text-secondary)" }}
                                                                        >
                                                                        Vaciar
                                                      </button>button>
                                                      <Link
                                                                          href={`/pedir/${tenant}/checkout`}
                                                                          className="rounded-xl px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90"
                                                                          style={{ background: "var(--brand-accent)", color: "var(--brand-accent-fg)" }}
                                                                        >
                                                                        Ver pedido →
                                                      </Link>Link>
                                      </>>
                                    ) : (
                                      <span className="text-sm" style={{ color: "var(--text-muted)" }}>Elige algo rico 🍔</span>span>
                                            )}
                                </div>div>
                      </div>div>
              </div>div>
        
          {/* ── Drawer de producto ────────────────────────────────────────── */}
          {selected && (
                  <ProductDrawer
                              open={open}
                              product={selected}
                              onClose={() => setOpen(false)}
                              onAdd={(product, qty, modifiers) => {
                                            addItem({
                                                            id: product.id,
                                                            name: product.name,
                                                            basePriceCents: product.basePriceCents,
                                                            quantity: qty,
                                                            modifiers,
                                            });
                                            setOpen(false);
                              }}
                            />
                )}
        </>>
      );
}</></>
