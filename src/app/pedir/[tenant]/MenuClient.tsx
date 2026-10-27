/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/store/cart";
import type { TenantTheme, StoreSettings } from "@/app/lib/tenantConfig";
import { themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import type { MenuModifierGroup } from "@/app/lib/menuOptions";
import type { PublicPerks } from "@/app/lib/perks";
import type { OnlinePresence } from "@/app/lib/brand";
import type { PublicStoreInfo } from "@/app/lib/storeOps";
import ProductOptionsSheet from "./ProductOptionsSheet";
import ComboSheet from "./ComboSheet";
import StampCard from "./StampCard";
import { captureCollabFromUrl } from "./collab";
import { ComboCard, ProductCard, PromoTile } from "./StoreCards";
import StoreFooter from "./StoreFooter";
import MenuCarousel from "./MenuCarousel";
import type { BusinessInfo } from "@/app/lib/business";
import type { WeeklyHours } from "@/app/lib/storeStatus";
import { useRouter } from "next/navigation";
import { rememberLang, storeMessage, ui, whenText, type Lang } from "@/app/lib/i18n";
import { rememberStore } from "@/app/lib/shopStore";
import DeliveryPartners, { type PartnerLink } from "./DeliveryPartners";
import type { ChoiceProduct, ComboSlotDef } from "@/app/lib/combos";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  imageUrl?: string | null;
  isFeatured?: boolean;
  bestSeller?: boolean; // el más vendido de su categoría (últimos 30 días)
  modifierGroups: MenuModifierGroup[];
  allergens?: string[];
  isCombo?: boolean;
  comboSlots?: ComboSlotDef[];
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
  deliveryPartners?: PartnerLink[];
  business: BusinessInfo;
  hours: WeeklyHours | null;
  lang?: Lang;
  languages?: Lang[];
  stores?: { id: string; name: string; address: string | null }[];
  storeId?: string | null;
};

const euros = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function MenuClient({ tenant, tenantName, categories, theme, settings, store, perks, online, deliveryPartners = [], business, hours, lang = "es", languages = ["es"], stores = [], storeId = null }: MenuClientProps) {
  const T = ui(lang);
  const router = useRouter();
  // Cambiar de idioma: se guarda la elección y se vuelve a pedir la página.
  function setLang(next: Lang) {
    rememberLang(next);
    router.refresh();
  }
  // Sucursales: cambiar de local recarga horario, zonas y estado de ese local.
  function setStore(id: string) {
    rememberStore(id);
    router.refresh();
  }
  const { items, addItem, inc, dec, remove } = useCart();
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug ?? "");
  // Producto cuyo selector de opciones (pan, guarnición, extras) está abierto.
  const [optionsFor, setOptionsFor] = useState<MenuProduct | null>(null);
  // Combo cuyo selector de pasos está abierto, y lo que se puede elegir dentro.
  const [comboFor, setComboFor] = useState<MenuProduct | null>(null);
  const catalog = useMemo(
    () => new Map<string, ChoiceProduct>(categories.flatMap((c) => c.products.filter((p) => !p.isCombo).map((p) => [p.id, { id: p.id, name: p.name, modifierGroups: p.modifierGroups }]))),
    [categories]
  );
  // Buscador de la carta: sin tildes ni mayúsculas, por nombre y descripción.
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const fold = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = fold(query.trim());
  const results = useMemo(
    () => {
      if (q.length < 2) return [];
      const all = categories.flatMap((c) => c.products).filter((p) => !p.isCombo);
      // Primero los que lo llevan en el nombre; después, los que lo nombran en la descripción.
      const byName = all.filter((p) => fold(p.name).includes(q));
      return [...byName, ...all.filter((p) => !byName.includes(p) && fold(p.description).includes(q))];
    },
    [q, categories]
  );
  const searching = q.length >= 2;
  const navRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Usar el theme del tenant o los defaults del sistema
  const t = theme ?? SYSTEM_DEFAULT_THEME;
  const cssVars = themeToCssVars(t);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  // Mostrar delivery o takeaway según config
  const deliveryLabel = settings?.deliveryEnabled && settings?.takeawayEnabled
    ? T.deliveryAndPickup
    : settings?.deliveryEnabled
    ? T.deliveryOnly
    : settings?.takeawayEnabled
    ? deliveryPartners.length ? T.pickupPlatforms : T.pickupOnly
    : T.onlineOrders;

  // Enlace de un colaborador (?c=CODIGO): se recuerda para el pedido.
  useEffect(() => {
    void captureCollabFromUrl(tenant);
  }, [tenant]);

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
    // Al cerrar el buscador las secciones se vuelven a montar: hay que observarlas otra vez.
  }, [categories, searching]);

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

  // Ficha del producto (foto grande y descripción): la abre tocar la tarjeta.
  function openProduct(product: MenuProduct) {
    if (product.isCombo) setComboFor(product);
    else setOptionsFor(product);
  }

  function handleAdd(product: MenuProduct) {
    if (product.isCombo) {
      setComboFor(product);
      return;
    }
    if (product.modifierGroups.length > 0) {
      setOptionsFor(product);
      return;
    }
    addItem({ productId: product.id, name: product.name, unitPriceCents: product.basePriceCents, optionIds: [], modifiers: [] });
    bumpCart();
  }

  const initials = tenantName.slice(0, 2).toUpperCase();
  const upper = cssVars["--heading-case"] === "uppercase";
  const heading = { fontFamily: cssVars["--font-heading"], textTransform: cssVars["--heading-case"] as any, fontWeight: upper ? 400 : 800, lineHeight: 0.95 };
  // Favoritos arriba de la carta: los marcados como Destacado (sin menús), hasta 6.
  const favorites = categories.flatMap((c) => c.products).filter((p) => p.isFeatured && !p.isCombo).slice(0, 6);
  const productCard = (product: MenuProduct, badge: "featured" | "bestseller" | null) => {
    const qty = getQty(product.id);
    const lineId = getLineId(product.id);
    return (
      <ProductCard
        lang={lang}
        name={product.name}
        description={product.description}
        priceCents={product.basePriceCents}
        imageUrl={product.imageUrl}
        allergens={product.allergens}
        qty={qty}
        simple={product.modifierGroups.length === 0}
        badge={badge}
        onAdd={() => handleAdd(product)}
        onOpen={() => openProduct(product)}
        onInc={() => { if (lineId) { inc(lineId); bumpCart(); } }}
        onDec={() => { if (!lineId) return; if (qty === 1) remove(lineId); else dec(lineId); }}
      />
    );
  };
  const visiblePromos = (perks?.promotions ?? []).filter((p) => settings?.deliveryEnabled || (p.channel !== "DELIVERY" && p.kind !== "FREE_DELIVERY"));
  const canSchedule = !!store?.slots && (store.slots.TAKEAWAY.length > 0 || store.slots.DELIVERY.length > 0);
  const firstSlug = categories[0]?.slug;

  // Animaciones al hacer scroll: los bloques con data-reveal aparecen al entrar en pantalla.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.classList.add("s-js");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("is-in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" }
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [categories, searching]);

  // El carrito "salta" cada vez que se añade algo.
  const [bump, setBump] = useState(0);
  const bumpCart = () => setBump((b) => b + 1);

  // Contenedor común: mismo margen para todo (como las webs de las cadenas).
  const wrap = "mx-auto w-full max-w-7xl px-4 sm:px-8";

  return (
    <div ref={rootRef} className="min-h-screen" style={{ backgroundColor: cssVars["--bg-base"], color: cssVars["--text-primary"], fontFamily: cssVars["--font-body"], ...(cssVars as any) }}>
      {/* Aviso de cerrado: franja fina arriba, no un bloque que tape la portada */}
      {store && !store.status.open && (
        <div className="px-4 py-2 text-center text-[13px] font-semibold" style={{ backgroundColor: cssVars["--brand-secondary"], color: "var(--on-secondary)" }}>
          🕐 {storeMessage(store.status.kind, store.status.message, lang)}{!store.status.open && store.status.reopens ? ` · ${T.closedOpens(whenText(store.status.reopens, lang)!)}` : ""}
          {canSchedule ? ` · ${T.canSchedule}` : ""}
        </div>
      )}

      {/* Sucursales: el cliente elige su local (solo si hay más de uno) */}
      {stores.length > 1 && (
        <div className="border-b border-[var(--border)] px-4 py-2 text-[13px]" style={{ backgroundColor: cssVars["--surface-1"] }}>
          <label className="mx-auto flex max-w-7xl items-center gap-2 sm:px-4">
            <span aria-hidden>📍</span>
            <span className="shrink-0 font-semibold">{T.yourStore}:</span>
            <select
              value={storeId ?? ""}
              onChange={(e) => setStore(e.target.value)}
              className="min-w-0 flex-1 truncate rounded-full bg-transparent px-2 py-1 font-semibold sm:flex-none"
              style={{ border: `1px solid ${cssVars["--border"]}`, color: cssVars["--text-primary"] }}
            >
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                  {st.address ? ` · ${st.address}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Cabecera: logo a la izquierda; estado, a domicilio y carrito a la derecha */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)]" style={{ backgroundColor: cssVars["--header-bg"] }}>
        <div className={`${wrap} flex h-16 items-center gap-3`}>
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex min-w-0 items-center gap-3 no-underline">
            {t.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.logoUrl} alt={tenantName} className="h-9 w-auto max-w-[150px] shrink-0 object-contain" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[15px] font-extrabold" style={{ backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)" }}>
                {initials}
              </span>
            )}
            {/* Con logo, el nombre escrito sobra (el logo ya lo dice y lleva el nombre como alt) */}
            {!t.logoUrl && <span className="truncate text-[16px] font-semibold" style={{ color: cssVars["--on-header"] }}>{tenantName}</span>}
          </a>
          <div className="ml-auto flex items-center gap-2">
            {store && (
              <span className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold sm:inline-flex" style={{ border: `1px solid ${cssVars["--border"]}`, color: cssVars["--on-header"] }}>
                <span className={`h-2 w-2 rounded-full ${store.status.open ? "bg-emerald-500" : ""}`} style={store.status.open ? undefined : { backgroundColor: cssVars["--brand-secondary"] }} />
                {store.status.open ? T.open : T.closed}
              </span>
            )}
            {deliveryPartners.length > 0 && !settings?.deliveryEnabled ? (
              <a href="#a-domicilio" className="p-press hidden rounded-full px-4 py-2 text-[13px] font-bold no-underline sm:inline-block" style={{ backgroundColor: cssVars["--brand-secondary"], color: "var(--on-secondary)" }}>
                🛵 {T.delivery}
              </a>
            ) : null}
            {/* Idioma: ES / EN (solo si el restaurante tiene la carta traducida) */}
            {languages.includes("en") && (
              <div className="flex rounded-full p-0.5 text-[12px] font-bold" style={{ border: `1px solid ${cssVars["--border"]}` }} role="group" aria-label={T.language}>
                {(["es", "en"] as const).map((l) => (
                  <button
                    key={l}
                    onClick={() => l !== lang && setLang(l)}
                    aria-pressed={l === lang}
                    className="p-press flex h-9 min-w-10 items-center justify-center rounded-full px-2.5 uppercase"
                    style={l === lang ? { backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)" } : { color: cssVars["--on-header"] }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <a
              href={`/pedir/${tenant}/checkout`}
              aria-label={`${T.viewOrder}: ${T.items(totalItems)}`}
              className="p-press relative flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-bold no-underline"
              style={{ backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M6 7h12l-1 13H7z" />
                <path d="M9 7a3 3 0 0 1 6 0" />
              </svg>
              <span key={bump} className={bump ? "s-bump inline-block" : "inline-block"}>{totalItems > 0 ? euros(totalCents) : T.order}</span>
              {totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold" style={{ backgroundColor: cssVars["--brand-secondary"], color: "var(--on-secondary)" }}>
                  {totalItems}
                </span>
              )}
            </a>
          </div>
        </div>
      </header>

      {/* Portada a todo lo ancho: foto con zoom lento y titular grande a la izquierda */}
      <section className="relative overflow-hidden" style={{ backgroundColor: cssVars["--brand-accent"], color: t.heroImageUrl ? "#ffffff" : "var(--on-accent)" }}>
        {t.heroImageUrl && (
          <div aria-hidden className="s-kenburns absolute inset-0" style={{ backgroundImage: `url("${t.heroImageUrl}")`, backgroundSize: "cover", backgroundPosition: "center" }} />
        )}
        <div aria-hidden className="absolute inset-0" style={{ background: t.heroImageUrl ? "linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.1) 100%)" : "radial-gradient(circle at 85% 20%, color-mix(in srgb, var(--bg-base) 18%, transparent) 0, transparent 45%)" }} />
        <div className={`${wrap} relative flex min-h-[240px] flex-col justify-end py-7 sm:min-h-[440px] sm:py-16`}>
          <p className="s-up text-[13px] font-semibold uppercase tracking-[0.14em] opacity-85" style={{ ["--i" as any]: 0 }}>{deliveryLabel}</p>
          <h1 className="s-up mt-3 max-w-3xl text-[44px] [text-wrap:balance] sm:text-[88px]" style={{ ...heading, ["--i" as any]: 1, color: t.heroImageUrl ? "#ffffff" : cssVars["--bg-base"] }}>
            {tenantName}
          </h1>
          <p className="s-up mt-4 max-w-md text-[16px] opacity-90" style={{ ["--i" as any]: 2 }}>{T.tagline}</p>
          <div className="s-up mt-7 flex flex-wrap gap-3" style={{ ["--i" as any]: 3 }}>
            {firstSlug && (
              <button onClick={() => scrollToCategory(firstSlug)} className="p-press rounded-full px-6 py-3.5 text-[15px] font-bold shadow-[0_12px_28px_-12px_rgba(0,0,0,0.6)]" style={{ backgroundColor: cssVars["--brand-secondary"], color: "var(--on-secondary)" }}>
                {T.seeMenu}
              </button>
            )}
            {deliveryPartners.length > 0 && (
              <a href="#a-domicilio" className="p-press rounded-full border-2 px-6 py-3 text-[15px] font-bold no-underline" style={{ borderColor: "currentColor", color: "inherit" }}>
                🛵 {T.delivery}
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Categorías: barra fija bajo la cabecera, alineada con el contenido */}
      <nav className="sticky top-16 z-40 border-b border-[var(--border)] shadow-[0_8px_20px_-18px_rgba(0,0,0,0.4)]" style={{ backgroundColor: cssVars["--surface-0"] }} aria-label={T.categories}>
        {searchOpen ? (
          <div className={`${wrap} flex items-center gap-2 py-2.5`}>
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border px-4" style={{ borderColor: cssVars["--brand-accent"], backgroundColor: cssVars["--surface-1"] }}>
              <SearchIcon />
              <input
                autoFocus
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={T.searchPlaceholder}
                aria-label={T.search}
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none"
                style={{ color: cssVars["--text-primary"] }}
              />
            </label>
            <button type="button" onClick={() => { setSearchOpen(false); setQuery(""); }} className="p-press h-11 shrink-0 px-2 text-[14px] font-semibold" style={{ color: cssVars["--brand-accent"] }}>
              {T.cancel}
            </button>
          </div>
        ) : (
        <div ref={navRef} className={`${wrap} flex gap-2 overflow-x-auto py-3`} style={{ scrollbarWidth: "none" }}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={T.search}
            title={T.search}
            className="p-press flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--text-secondary)] [@media(hover:hover)]:hover:border-[var(--brand-accent)] [@media(hover:hover)]:hover:text-[var(--brand-accent)]"
          >
            <SearchIcon />
          </button>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.slug;
            return (
              <button
                key={cat.slug}
                data-slug={cat.slug}
                onClick={() => scrollToCategory(cat.slug)}
                aria-current={isActive ? "true" : undefined}
                // Al pasar el ratón se tiñe con el color de la marca (en móvil no hay hover).
                className={`p-press shrink-0 rounded-full border px-4 py-2.5 text-[14px] transition-colors duration-300 ${
                  isActive
                    ? "border-transparent bg-[var(--brand-accent)] font-bold text-[var(--on-accent)]"
                    : "border-[var(--border)] bg-transparent font-medium text-[var(--text-secondary)] [@media(hover:hover)]:hover:border-[var(--brand-accent)] [@media(hover:hover)]:hover:bg-[color-mix(in_srgb,var(--brand-accent)_10%,transparent)] [@media(hover:hover)]:hover:text-[var(--brand-accent)]"
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
        )}
      </nav>

      <main className={`${wrap} ${searching ? "pt-6" : "pt-8"} pb-4`}>
        {searching ? (
          <section aria-live="polite" className="min-h-[50vh]">
            <p className="mb-4 text-[14px] font-semibold" style={{ color: cssVars["--text-secondary"] }}>{T.searchResults(results.length)}</p>
            {results.length ? (
              <Wrap carousel={false} perView={t.menusPerRow} lang={lang}>
                {results.map((product) => (
                  <div key={product.id} className="h-full">
                    {productCard(product, product.isFeatured ? "featured" : product.bestSeller ? "bestseller" : null)}
                  </div>
                ))}
              </Wrap>
            ) : (
              <p className="py-16 text-center text-[15px]" style={{ color: cssVars["--text-secondary"] }}>{T.noResults(query.trim())}</p>
            )}
          </section>
        ) : (
        <>
        {/* A domicilio con plataformas (sin repartidores propios): como McDonald's */}
        {deliveryPartners.length > 0 && (
          <section id="a-domicilio" data-reveal className="mb-12 scroll-mt-32 rounded-[26px] p-6 sm:p-8" style={{ backgroundColor: cssVars["--surface-0"], boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }} aria-label={T.delivery}>
            <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,520px)] lg:items-center">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: cssVars["--brand-secondary"] }}>🛵 {T.delivery}</p>
                <h2 className="mt-2 text-[34px] sm:text-[44px]" style={{ ...heading, color: cssVars["--heading-color"] }}>
                  {settings?.deliveryEnabled ? T.alsoInYourApp : T.chooseCourier}
                </h2>
                <p className="mt-2 max-w-md text-[14px]" style={{ color: cssVars["--text-secondary"] }}>
                  {settings?.deliveryEnabled ? T.alsoInYourAppText : T.courierText}
                </p>
              </div>
              <DeliveryPartners partners={deliveryPartners} />
            </div>
          </section>
        )}

        {/* Nuestros favoritos: los que el restaurante marca como Destacado (hasta 6), en fila deslizante */}
        {favorites.length > 0 && (
          <section className="mb-14" aria-label={T.favorites}>
            <h2 data-reveal className="mb-4 text-[28px] sm:text-[38px]" style={{ ...heading, color: cssVars["--heading-color"] }}>{T.favorites}</h2>
            <div className="s-row -mx-4 flex items-stretch gap-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
              {favorites.map((product, i) => (
                <div key={product.id} data-reveal className="w-[84vw] max-w-[360px] shrink-0 sm:w-[260px]" style={{ ["--i" as any]: Math.min(i, 6) }}>
                  {productCard(product, "featured")}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Promociones y tarjeta de sellos: fila deslizante de tarjetas de color */}
        {perks && (visiblePromos.length > 0 || perks.loyalty) && (
          <section className="mb-14" aria-label={T.promotions}>
            <h2 data-reveal className="mb-4 text-[28px] sm:text-[38px]" style={{ ...heading, color: cssVars["--heading-color"] }}>{T.promotions}</h2>
            <div className="s-row -mx-4 flex items-stretch gap-4 overflow-x-auto px-4 pb-2 sm:-mx-8 sm:px-8">
              {perks.loyalty && (
                <div data-reveal className="w-[85vw] max-w-[380px] shrink-0 sm:w-[380px]">
                  <StampCard ordersRequired={perks.loyalty.ordersRequired} stamps={null} rewardName={perks.loyalty.rewardName} upperHeadings={upper} lang={lang} />
                </div>
              )}
              {visiblePromos.map((p, i) => (
                <div key={p.id} data-reveal className="flex" style={{ ["--i" as any]: i + 1 }}>
                  <PromoTile promo={p} tone={i % 2 === 0 ? "secondary" : "accent"} upperHeadings={upper} lang={lang} />
                </div>
              ))}
            </div>
          </section>
        )}

        {categories.map((cat) => {
          const combos = cat.products.every((p) => p.isCombo);
          return (
            <section key={cat.slug} ref={(el) => { sectionRefs.current[cat.slug] = el; }} className="mb-10 scroll-mt-36">
              <div data-reveal className="mb-4">
                <h2 className="text-[28px] sm:text-[38px]" style={{ ...heading, color: cssVars["--heading-color"] }}>{cat.name}</h2>
                {cat.description && <p className="mt-2 text-[14px]" style={{ color: cssVars["--text-secondary"] }}>{cat.description}</p>}
              </div>
              {/* Menús: carrusel (2 en el móvil; en ordenador los que elija el dueño en Marca). Productos: filas en el móvil (ingredientes y foto) y 2 / 3 / 4 columnas desde tableta. */}
              <Wrap carousel={combos} perView={t.menusPerRow} lang={lang}>
                {cat.products.map((product, i) => {
                  const qty = getQty(product.id);
                  return (
                    <div key={product.id} data-reveal className="h-full" style={{ ["--i" as any]: Math.min(i, 6) }}>
                      {product.isCombo ? (
                        <ComboCard
                          lang={lang}
                          name={product.name}
                          description={product.description}
                          priceCents={product.basePriceCents}
                          slots={product.comboSlots ?? []}
                          imageUrl={product.imageUrl}
                          qty={qty}
                          onAdd={() => handleAdd(product)}
                          upperHeadings={upper}
                        />
                      ) : (
                        productCard(product, product.isFeatured ? "featured" : product.bestSeller ? "bestseller" : null)
                      )}
                    </div>
                  );
                })}
              </Wrap>
            </section>
          );
        })}

        </>
        )}
      </main>

      {/* Pie con los datos del negocio (Configuración → Información del negocio) */}
      <div className={totalItems > 0 ? "pb-24" : ""}>
        <StoreFooter tenant={tenant} tenantName={tenantName} logoUrl={t.logoUrl} business={business} hours={hours} online={online} upperHeadings={upper} lang={lang} />
      </div>
      {optionsFor && (
        <ProductOptionsSheet
          lang={lang}
          product={optionsFor}
          onClose={() => setOptionsFor(null)}
          withQty
          onAdd={({ quantity, ...line }) => {
            for (let n = 0; n < quantity; n++) addItem({ productId: optionsFor.id, name: optionsFor.name, ...line });
            bumpCart();
            setOptionsFor(null);
          }}
        />
      )}
      {comboFor && (
        <ComboSheet
          lang={lang}
          combo={{ id: comboFor.id, name: comboFor.name, description: comboFor.description, basePriceCents: comboFor.basePriceCents, comboSlots: comboFor.comboSlots ?? [] }}
          catalog={catalog}
          onClose={() => setComboFor(null)}
          onAdd={(line) => {
            addItem({ productId: comboFor.id, name: comboFor.name, optionIds: [], ...line });
            bumpCart();
            setComboFor(null);
          }}
        />
      )}
      {/* Barra flotante del pedido: toda la barra lleva al pedido (blanco fácil
          para el pulgar). «Vaciar» está en el pedido, no aquí, para no tocarlo sin querer. */}
      {totalItems > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-6">
          <a
            href={`/pedir/${tenant}/checkout`}
            className="s-up p-press pointer-events-auto mx-auto flex min-h-[60px] max-w-xl items-center gap-3 rounded-full p-2 pl-2 no-underline shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)]"
            style={{ backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)" }}
          >
            <span key={bump} className={`flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2 text-[16px] font-bold tabular-nums ${bump ? "s-bump" : ""}`} style={{ backgroundColor: "color-mix(in srgb, var(--on-accent) 16%, transparent)" }}>
              {totalItems}
            </span>
            <span className="min-w-0 flex-1 truncate text-[16px] font-bold">{T.viewOrder.replace(/\s*→$/, "")}</span>
            <span className="shrink-0 rounded-full px-5 py-3 text-[16px] font-bold tabular-nums" style={{ backgroundColor: cssVars["--bg-base"], color: cssVars["--brand-accent"] }}>
              {euros(totalCents)} →
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

// Los menús van en carrusel; el resto de categorías, en cuadrícula.
function Wrap({ carousel, perView, lang, children }: { carousel: boolean; perView: number; lang: Lang; children: React.ReactNode }) {
  if (carousel) return <MenuCarousel perView={Math.min(Math.max(Number(perView) || 2, 2), 5)} lang={lang}>{children}</MenuCarousel>;
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="shrink-0 opacity-70">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
