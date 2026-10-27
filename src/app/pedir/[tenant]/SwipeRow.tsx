"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// Fila que se desliza con el dedo (Nuestros favoritos, Promociones) con puntos
// debajo: cuántas tarjetas hay y en cuál estás. Sin nada que deslizar, sin puntos.
export default function SwipeRow({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  const [state, setState] = useState({ active: 0, canScroll: false, n: 0 });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
    const kids = [...el.children] as HTMLElement[];
    // Al final de la fila, el último; si no, la tarjeta más cerca del margen izquierdo.
    let active = 0;
    if (max > 2 && el.scrollLeft >= max - 2) active = kids.length - 1;
    else kids.forEach((k, i) => { if (Math.abs(k.offsetLeft - pad - el.scrollLeft) < Math.abs(kids[active].offsetLeft - pad - el.scrollLeft)) active = i; });
    setState({ active, canScroll: max > 2, n: kids.length }); // contar en el DOM: los huecos condicionales no cuentan
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
  }, [measure, count]);

  return (
    <div>
      <div ref={ref} className={className}>
        {children}
      </div>
      {state.canScroll && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: state.n }, (_, i) => (
            <span
              key={i}
              className="h-2 rounded-full transition-all duration-300"
              style={{ width: i === state.active ? 22 : 8, backgroundColor: i === state.active ? "var(--brand-accent)" : "color-mix(in srgb, var(--text-secondary) 35%, transparent)" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
