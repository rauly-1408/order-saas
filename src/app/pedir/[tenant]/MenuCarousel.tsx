"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ui, type Lang } from "@/app/lib/i18n";

// Carrusel de los menús. En el móvil se ve uno grande y asoma el siguiente por
// el borde (invita a deslizar con el dedo); en tableta, dos. En ordenador se ven `perView` a la vez (lo elige el dueño en
// Marca: 2 a 5) y, si hay más, flechas y puntos para pasar. Con pocos menús no
// hay nada que pasar y queda como una cuadrícula normal.

export default function MenuCarousel({ perView, lang = "es", children }: { perView: number; lang?: Lang; children: ReactNode }) {
  const T = ui(lang);
  const items = Children.toArray(children);
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ pages: 1, page: 0, canScroll: false });
  const pageStep = useRef(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.offsetWidth + gap : el.clientWidth; // ancho de una tarjeta con su hueco
    // Tarjetas que caben a la vez (+1 px por los redondeos de los anchos en %).
    const perPage = Math.max(1, Math.floor((el.clientWidth + gap + 1) / step));
    const pages = Math.max(1, Math.ceil(el.children.length / perPage));
    const page = Math.min(pages - 1, Math.round(el.scrollLeft / (step * perPage)));
    pageStep.current = step * perPage;
    setState({ pages, page, canScroll: el.scrollWidth > el.clientWidth + 2 });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [measure, items.length]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * (pageStep.current || el.clientWidth), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={ref}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-stretch gap-3 overflow-x-auto overscroll-x-contain scroll-smooth px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0 lg:gap-5"
        style={{ scrollbarWidth: "none", ["--per-view" as string]: perView }}
      >
        {items.map((child, i) => (
          <div key={i} className="@container w-[84%] shrink-0 snap-start sm:w-[calc((100%-12px)/2)] lg:w-[calc((100%-20px*(var(--per-view)-1))/var(--per-view))]">
            {child}
          </div>
        ))}
      </div>

      {state.canScroll && (
        <>
          {/* Flechas (ordenador) */}
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={state.page === 0}
            aria-label={T.carouselPrev}
            className="p-press absolute top-1/2 -left-3 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full shadow-[0_6px_20px_-6px_rgba(0,0,0,0.4)] disabled:opacity-30 lg:flex"
            style={{ backgroundColor: "var(--surface-1)", color: "var(--text-primary)" }}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={state.page >= state.pages - 1}
            aria-label={T.carouselNext}
            className="p-press absolute top-1/2 -right-3 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full shadow-[0_6px_20px_-6px_rgba(0,0,0,0.4)] disabled:opacity-30 lg:flex"
            style={{ backgroundColor: "var(--surface-1)", color: "var(--text-primary)" }}
          >
            →
          </button>
          {/* Puntos: en qué página estamos */}
          <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
            {Array.from({ length: state.pages }, (_, i) => (
              <span key={i} className="h-2 rounded-full transition-all duration-300" style={{ width: i === state.page ? 22 : 8, backgroundColor: i === state.page ? "var(--brand-accent)" : "color-mix(in srgb, var(--text-secondary) 35%, transparent)" }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
