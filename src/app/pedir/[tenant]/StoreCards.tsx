"use client";

import type { CSSProperties } from "react";
import { promotionConditions, type PromotionRule } from "@/app/lib/promotions";
import type { ComboSlotDef } from "@/app/lib/combos";
import { ui, type Lang } from "@/app/lib/i18n";

// Tarjetas de la tienda pública: promoción, menú (combo) y producto. Cada una
// con su propio aspecto para que no parezcan todas iguales. Usan las CSS vars
// del theme del tenant (definidas en MenuClient).

const euros = (cents: number) => (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

type Heading = { upperHeadings: boolean; lang?: Lang };
const headingStyle = (upper: boolean): CSSProperties => ({
  fontFamily: "var(--font-heading)",
  textTransform: upper ? "uppercase" : "none",
  fontWeight: upper ? 400 : 800,
  lineHeight: 0.95,
});

// ── Promoción: el número grande manda ("−15 %", "Envío gratis") ──────────
function bigValue(p: PromotionRule, lang: Lang): { value: string; caption: string } {
  const T = ui(lang);
  if (p.kind === "FREE_DELIVERY") return { value: T.freeDelivery, caption: T.athome };
  if (p.kind === "ORDER_PERCENT") return { value: `−${p.value} %`, caption: T.onYourOrder };
  return { value: `−${euros(p.value).replace(",00", "")}`, caption: T.onYourOrder };
}

export function PromoTile({ promo, tone, upperHeadings, lang = "es" }: { promo: PromotionRule; tone: "accent" | "secondary" } & Heading) {
  const { value, caption } = bigValue(promo, lang);
  const cond = promotionConditions(promo, lang);
  const bg = tone === "accent" ? "var(--brand-accent)" : "var(--brand-secondary)";
  const fg = tone === "accent" ? "var(--on-accent)" : "var(--on-secondary)";
  return (
    <article className="s-shine p-lift relative flex min-h-[188px] w-[78vw] max-w-[320px] shrink-0 flex-col justify-between rounded-[22px] p-5 sm:w-[300px]" style={{ backgroundColor: bg, color: fg }}>
      {/* Formas decorativas en el tono de fondo de la carta */}
      <span aria-hidden className="absolute -right-10 -top-10 h-36 w-36 rounded-full opacity-15" style={{ backgroundColor: "var(--bg-base)" }} />
      <span aria-hidden className="absolute -bottom-12 right-8 h-24 w-24 rounded-full opacity-10" style={{ backgroundColor: "var(--bg-base)" }} />
      <p className="relative text-[11px] font-bold uppercase tracking-[0.1em] opacity-80">🏷️ {promo.name}</p>
      <div className="relative">
        <p className="text-[44px]" style={headingStyle(upperHeadings)}>
          {value}
        </p>
        <p className="mt-1 text-[13px] font-semibold opacity-90">{caption}</p>
      </div>
      <p className="relative text-[12px] opacity-85">{cond ? `${cond.charAt(0).toUpperCase()}${cond.slice(1)} · ` : ""}{ui(lang).appliesAlone}</p>
    </article>
  );
}

// ── Menú / combo: tarjeta ancha con los pasos numerados y el precio cerrado ─
export function ComboCard({
  name,
  description,
  priceCents,
  slots,
  qty,
  onAdd,
  upperHeadings,
  imageUrl,
  lang = "es",
}: { name: string; description: string; priceCents: number; slots: ComboSlotDef[]; qty: number; onAdd: () => void; imageUrl?: string | null } & Heading) {
  const T = ui(lang);
  const steps = slots.map((s) => {
    const t = s.name.replace(/^elige (tu |un |una )?/i, "");
    // Pasos opcionales (p. ej. «Complementos») marcados como tales.
    return t.charAt(0).toUpperCase() + t.slice(1) + (s.required === false ? ` (${T.optionalStep.toLowerCase()})` : "");
  });
  return (
    <article
      // @max-[420px]: versión compacta cuando la tarjeta es estrecha (dos por pantalla en el móvil, 4-5 por fila en ordenador).
      className="p-lift group relative flex h-full flex-col overflow-hidden rounded-[26px] p-6 sm:p-7 @max-[420px]:p-4"
      style={{ background: "linear-gradient(135deg, var(--brand-accent) 0%, color-mix(in srgb, var(--brand-accent) 78%, black) 100%)", color: "var(--on-accent)" }}
    >
      {/* Foto del menú (Carta → editar el menú → Imagen), arriba como en los productos. */}
      {imageUrl && (
        <div className="relative -mx-6 -mt-6 mb-5 overflow-hidden sm:-mx-7 sm:-mt-7 @max-[420px]:-mx-4 @max-[420px]:-mt-4 @max-[420px]:mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={name} className="aspect-[16/9] w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        </div>
      )}
      <span aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-10" style={{ backgroundColor: "var(--bg-base)" }} />
      <div className="relative flex items-start justify-between gap-3">
        <span className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]" style={{ backgroundColor: "var(--brand-secondary)", color: "var(--on-secondary)" }}>
          {T.menuBadge}
        </span>
        {qty > 0 && <span className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold">{T.inYourOrder(qty)}</span>}
      </div>
      <h3 className="relative mt-4 text-[34px] sm:text-[40px] @max-[420px]:mt-2 @max-[420px]:text-[22px] @max-[420px]:leading-tight" style={headingStyle(upperHeadings)}>
        {name}
      </h3>
      {description && <p className="relative mt-2 max-w-md text-[14px] opacity-85 @max-[420px]:text-[12px]">{description}</p>}
      {/* Pasos: chips compactos para que quepan en una línea en ordenador y en dos en el móvil. */}
      <ol className="relative mt-5 flex flex-wrap items-center gap-1.5 @max-[420px]:mt-3 @max-[420px]:gap-1" aria-label={T.menuSteps}>
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pr-2.5 pl-0.5 text-[12px] font-semibold @max-[420px]:pr-2 @max-[420px]:text-[11px]" style={{ backgroundColor: "color-mix(in srgb, var(--bg-base) 18%, transparent)" }}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: "var(--bg-base)", color: "var(--brand-accent)" }}>
                {i + 1}
              </span>
              {s}
            </span>
            {i < steps.length - 1 && <span aria-hidden className="text-[12px] opacity-60">+</span>}
          </li>
        ))}
      </ol>
      {/* Precio y botón siempre abajo: así dos menús en la misma fila miden lo mismo. */}
      <div className="relative mt-auto flex items-end justify-between gap-4 pt-6 @max-[420px]:flex-col @max-[420px]:items-stretch @max-[420px]:gap-2 @max-[420px]:pt-4">
        <div>
          <p className="text-[12px] opacity-75 @max-[420px]:text-[11px]">{T.allFor}</p>
          <p className="text-[38px] @max-[420px]:text-[26px]" style={headingStyle(upperHeadings)}>
            {euros(priceCents)}
          </p>
        </div>
        <button onClick={onAdd} className="p-press shrink-0 rounded-full px-5 py-3 text-[15px] font-bold shadow-[0_10px_24px_-10px_rgba(0,0,0,0.5)] @max-[420px]:w-full @max-[420px]:px-3 @max-[420px]:py-2.5 @max-[420px]:text-[13px]" style={{ backgroundColor: "var(--bg-base)", color: "var(--brand-accent)" }}>
          {T.buildMenu}
        </button>
      </div>
    </article>
  );
}

// ── Producto: tarjeta clara con botón redondo "+" ─────────────────────────
export function ProductCard({
  name,
  description,
  priceCents,
  imageUrl,
  allergens,
  qty,
  simple,
  onAdd,
  onInc,
  onDec,
  lang = "es",
  badge = null,
}: {
  name: string;
  description: string;
  priceCents: number;
  imageUrl?: string | null;
  allergens?: string[];
  qty: number;
  // «Recomendado» (lo marca el restaurante) o «Lo más pedido» (sale solo de las ventas).
  badge?: "featured" | "bestseller" | null;
  simple: boolean; // sin opciones: se puede sumar/restar aquí mismo
  onAdd: () => void;
  onInc: () => void;
  onDec: () => void;
  lang?: Lang;
}) {
  const T = ui(lang);
  return (
    <article
      className="p-lift group relative flex h-full flex-col overflow-hidden rounded-[var(--border-radius)] bg-[var(--surface-1)]"
      style={{ boxShadow: qty > 0 ? "0 0 0 2px var(--brand-accent)" : "0 1px 2px rgba(0,0,0,0.05)" }}
    >
      {imageUrl && (
        <div className="overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={name} className="aspect-[4/3] w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        </div>
      )}
      {badge && imageUrl && <ProductBadge kind={badge} lang={lang} className="absolute left-3 top-3" />}
      {qty > 0 && (
        <span className="absolute right-3 top-3 flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[13px] font-bold" style={{ backgroundColor: "var(--brand-accent)", color: "var(--on-accent)" }}>
          {qty}
        </span>
      )}
      <div className="flex flex-1 flex-col px-5 pt-5">
        {badge && !imageUrl && <ProductBadge kind={badge} lang={lang} className="mb-2 self-start" />}
        <h3 className="pr-8 text-[17px] font-bold leading-snug tracking-[-0.01em] text-[var(--text-primary)]">{name}</h3>
        {description && <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">{description}</p>}
        {allergens && allergens.length > 0 && <p className="mt-2 text-[11px] text-[var(--text-secondary)]">{T.allergens}: {allergens.join(", ")}</p>}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-5">
        <span className="text-[18px] font-bold tabular-nums text-[var(--brand-secondary)]">{euros(priceCents)}</span>
        {simple && qty > 0 ? (
          <div className="flex items-center gap-2">
            <button onClick={onDec} aria-label={T.removeOne(name)} className="p-press flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--brand-accent)] text-xl font-bold text-[var(--brand-accent)]">
              −
            </button>
            <span className="min-w-5 text-center text-[16px] font-bold tabular-nums">{qty}</span>
            <button onClick={onInc} aria-label={T.addAnother(name)} className="p-press flex h-11 w-11 items-center justify-center rounded-full bg-[var(--brand-accent)] text-xl font-bold text-[var(--on-accent)]">
              +
            </button>
          </div>
        ) : (
          <button
            onClick={onAdd}
            aria-label={T.addX(name)}
            className="p-press flex h-11 items-center gap-1.5 rounded-full bg-[var(--brand-accent)] pr-4 pl-3 text-[15px] font-bold text-[var(--on-accent)] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.5)] transition-transform [@media(hover:hover)]:group-hover:scale-105"
          >
            <span className="text-xl leading-none">+</span> {T.add}
          </button>
        )}
      </div>
    </article>
  );
}

// Etiqueta de la tarjeta: «★ Recomendado» en el color de la marca o «Lo más pedido».
function ProductBadge({ kind, lang, className = "" }: { kind: "featured" | "bestseller"; lang: Lang; className?: string }) {
  const T = ui(lang);
  return (
    <span
      className={`${className} inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide shadow-[0_4px_12px_-6px_rgba(0,0,0,0.45)]`}
      style={kind === "featured" ? { backgroundColor: "var(--brand-accent)", color: "var(--on-accent)" } : { backgroundColor: "var(--surface-1)", color: "var(--brand-secondary)", boxShadow: "inset 0 0 0 1.5px var(--brand-secondary)" }}
    >
      {kind === "featured" ? <><span aria-hidden>★</span> {T.badgeFeatured}</> : T.badgeBestSeller}
    </span>
  );
}
