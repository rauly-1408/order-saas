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
import { ComboCard, ProductCard, PromoTile } from "./StoreCards";
import StoreFooter from "./StoreFooter";
import type { BusinessInfo } from "@/app/lib/business";
import type { WeeklyHours } from "@/app/lib/storeStatus";
import { useRouter } from "next/navigation";
import { rememberLang, storeMessage, ui, whenText, type Lang } from "@/app/lib/i18n";
import DeliveryPartners, { type PartnerLink } from "./DeliveryPartners";
import type { ChoiceProduct, ComboSlotDef } from "@/app/lib/combos";

type MenuProduct = {
  id: string;
  name: string;
  description: string;
  basePriceCents: number;
  imageUrl?: string | null;
  isFeatured?: boolean;
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
};

const euros = (cents: number) =>
  (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function MenuClient({ tenant, tenantName, categories, theme, settings, store, perks, online, deliveryPartners = [], business, hours, lang = "es", languages = ["es"] }: MenuClientProps) {
  const T = ui(lang);
  const router = useRouter();
  // Cambiar de idioma: se guarda la elección y se vuelve a pedir la página.
  function setLang(next: Lang) {
    rememberLang(next);
    router.refresh();
  }
  const { items, addItem, inc, dec, remove, clear } = useCart();
  const [activeCategory, setActiveCategory] = useState(categories[0]?.slug ?? "");
  // Producto cuyo selector de opciones (pan, guarnición, extras) está abierto.
  const [optionsFor, setOptionsFor] = useState<MenuProduct | null>(null);
  // Combo cuyo selector de pasos está abierto, y lo que se puede elegir dentro.
  const [comboFor, setComboFor] = useState<MenuProduct | null>(null);
  const catalog = useMemo(
    () => new Map<string, ChoiceProduct>(categories.flatMap((c) => c.products.filter((p) => !p.isCombo).map((p) => [p.id, { id: p.id, name: p.name, modifierGroups: p.modifierGroups }]))),
    [categories]
  );
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
  }, [categories]);

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
                    className="p-press rounded-full px-2.5 py-1 uppercase"
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
              className="p-press relative flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-bold no-underline"
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
        <div className={`${wrap} relative flex min-h-[380px] flex-col justify-end py-12 sm:min-h-[520px] sm:py-20`}>
          <p className="s-up text-[13px] font-semibold uppercase tracking-[0.14em] opacity-85" style={{ ["--i" as any]: 0 }}>{deliveryLabel}</p>
          <h1 className="s-up mt-3 max-w-3xl text-[56px] sm:text-[104px]" style={{ ...heading, ["--i" as any]: 1, color: t.heroImageUrl ? "#ffffff" : cssVars["--bg-base"] }}>
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
        <div ref={navRef} className={`${wrap} flex gap-2 overflow-x-auto py-3`} style={{ scrollbarWidth: "none" }}>
          {categories.map((cat) => {
            const isActive = activeCategory === cat.slug;
            return (
              <button
                key={cat.slug}
                data-slug={cat.slug}
                onClick={() => scrollToCategory(cat.slug)}
                aria-current={isActive ? "true" : undefined}
                // Al pasar el ratón se tiñe con el color de la marca (en móvil no hay hover).
                className={`p-press shrink-0 rounded-full border px-4 py-2 text-[14px] transition-colors duration-300 ${
                  isActive
                    ? "border-transparent bg-[var(--brand-accent)] font-bold text-[var(--on-accent)]"
                    : "border-[var(--border)] bg-transparent font-medium text-[var(--text-secondary)] hover:border-[var(--brand-accent)] hover:bg-[color-mix(in_srgb,var(--brand-accent)_10%,transparent)] hover:text-[var(--brand-accent)]"
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </nav>

      <main className={`${wrap} pt-10 pb-4`}>
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

        {/* Promociones y tarjeta de sellos: fila deslizante de tarjetas de color */}
        {perks && (visiblePromos.length > 0 || perks.loyalty) && (
          <section className="mb-14" aria-label={T.promotions}>
            <h2 data-reveal className="mb-5 text-[34px] sm:text-[44px]" style={{ ...heading, color: cssVars["--heading-color"] }}>{T.promotions}</h2>
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
            <section key={cat.slug} ref={(el) => { sectionRefs.current[cat.slug] = el; }} className="mb-14 scroll-mt-36">
              <div data-reveal className="mb-5">
                <h2 className="text-[34px] sm:text-[44px]" style={{ ...heading, color: cssVars["--heading-color"] }}>{cat.name}</h2>
                {cat.description && <p className="mt-2 text-[14px]" style={{ color: cssVars["--text-secondary"] }}>{cat.description}</p>}
              </div>
              {/* Menús: tarjetas anchas (1 o 2 por fila). Productos: 1 / 2 / 3 / 4 columnas. */}
              <div className={combos ? "grid gap-5 lg:grid-cols-2" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}>
                {cat.products.map((product, i) => {
                  const qty = getQty(product.id);
                  const lineId = getLineId(product.id);
                  return (
                    <div key={product.id} data-reveal style={{ ["--i" as any]: Math.min(i, 6) }}>
                      {product.isCombo ? (
                        <ComboCard
                          lang={lang}
                          name={product.name}
                          description={product.description}
                          priceCents={product.basePriceCents}
                          slots={product.comboSlots ?? []}
                          qty={qty}
                          onAdd={() => handleAdd(product)}
                          upperHeadings={upper}
                        />
                      ) : (
                        <ProductCard
                          lang={lang}
                          name={product.name}
                          description={product.description}
                          priceCents={product.basePriceCents}
                          imageUrl={product.imageUrl}
                          allergens={product.allergens}
                          qty={qty}
                          simple={product.modifierGroups.length === 0}
                          onAdd={() => handleAdd(product)}
                          onInc={() => { if (lineId) { inc(lineId); bumpCart(); } }}
                          onDec={() => { if (!lineId) return; if (qty === 1) remove(lineId); else dec(lineId); }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

      </main>

      {/* Pie con los datos del negocio (Personalización → Datos del negocio) */}
      <div className={totalItems > 0 ? "pb-24" : ""}>
        <StoreFooter tenant={tenant} tenantName={tenantName} logoUrl={t.logoUrl} business={business} hours={hours} online={online} upperHeadings={upper} lang={lang} />
      </div>
      {optionsFor && (
        <ProductOptionsSheet
          lang={lang}
          product={optionsFor}
          onClose={() => setOptionsFor(null)}
          onAdd={(line) => {
            addItem({ productId: optionsFor.id, name: optionsFor.name, ...line });
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
      {/* Barra flotante del pedido */}
      {totalItems > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:px-6">
          <div className="s-up mx-auto flex max-w-xl items-center gap-3 rounded-full p-2 pl-5 shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)]" style={{ backgroundColor: cssVars["--brand-accent"], color: "var(--on-accent)" }}>
            <div className="min-w-0 flex-1">
              <div key={bump} className={`text-[16px] font-bold tabular-nums ${bump ? "s-bump inline-block" : ""}`}>{euros(totalCents)}</div>
              <div className="text-[12px] opacity-80">{T.items(totalItems)}</div>
            </div>
            <button onClick={clear} className="p-press shrink-0 rounded-full px-3 py-2 text-[13px] opacity-80 hover:opacity-100">{T.clear}</button>
            <a href={`/pedir/${tenant}/checkout`} className="p-press shrink-0 rounded-full px-6 py-3 text-[15px] font-bold no-underline" style={{ backgroundColor: cssVars["--bg-base"], color: cssVars["--brand-accent"] }}>
              {T.viewOrder}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
