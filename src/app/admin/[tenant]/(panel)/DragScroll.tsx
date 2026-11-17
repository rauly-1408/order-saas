"use client";

import { useEffect } from "react";

// Desplazar arrastrando, para pantallas táctiles que Windows ve como un ratón.
// Muchas pantallas de TPV (sobre todo las de ordenador todo en uno) mandan el
// dedo como si fuera un ratón: el navegador no desplaza al arrastrar, sino que
// selecciona texto. Aquí, un arrastre con «ratón» desplaza la lista o la fila
// que hay debajo, como con el dedo en un iPad, con inercia al soltar.
// Con una pantalla táctil de verdad (o un iPad) no hace nada: eso lo hace ya
// el navegador. Ver docs/PANTALLAS-TACTILES.md

const THRESHOLD = 8; // px antes de decidir que es un arrastre y no un toque
// Donde arrastrar hace otra cosa: escribir, mover mesas en el plano, llevar
// una tarjeta de pedido a otra columna…
const SKIP = 'input, textarea, select, [contenteditable="true"], [draggable="true"], .touch-none, [data-no-drag-scroll]';

type Axis = "x" | "y";

function canScroll(el: Element, axis: Axis): boolean {
  const s = getComputedStyle(el);
  const o = axis === "x" ? s.overflowX : s.overflowY;
  const scrollable = el === document.scrollingElement || o === "auto" || o === "scroll";
  return scrollable && (axis === "x" ? el.scrollWidth > el.clientWidth + 1 : el.scrollHeight > el.clientHeight + 1);
}

// El contenedor más cercano que se puede desplazar en ese sentido.
function scrollerFor(start: Element, axis: Axis): Element | null {
  for (let el: Element | null = start; el; el = el.parentElement) if (canScroll(el, axis)) return el;
  const root = document.scrollingElement;
  return root && canScroll(root, axis) ? root : null;
}

export default function DragScroll() {
  useEffect(() => {
    let start: { x: number; y: number; target: Element; id: number } | null = null;
    let drag: { el: Element; axis: Axis; last: number; t: number; v: number } | null = null;
    let raf = 0;

    const stopInertia = () => cancelAnimationFrame(raf);

    const onDown = (e: PointerEvent) => {
      stopInertia();
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const target = e.target as Element | null;
      if (!target || target.closest(SKIP)) return;
      start = { x: e.clientX, y: e.clientY, target, id: e.pointerId };
      drag = null;
    };

    const onMove = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (!(e.buttons & 1)) return void (start = null);
      if (!drag) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) < THRESHOLD) return;
        // Sentido del gesto; si en ese sentido no hay nada que desplazar, el otro.
        const main: Axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        const other: Axis = main === "x" ? "y" : "x";
        let axis = main;
        let el = scrollerFor(start.target, main);
        if (!el) {
          el = scrollerFor(start.target, other);
          axis = other;
        }
        if (!el) return void (start = null); // nada que desplazar: que el navegador haga lo suyo
        drag = { el, axis, last: axis === "x" ? e.clientX : e.clientY, t: e.timeStamp, v: 0 };
        document.documentElement.classList.add("drag-scrolling");
        window.getSelection()?.removeAllRanges();
        // Lo que empezó con el «clic» (p. ej. la pulsación larga de un producto en la Caja) se anula.
        start.target.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: e.pointerId, pointerType: "mouse" }));
      }
      const pos = drag.axis === "x" ? e.clientX : e.clientY;
      const delta = drag.last - pos;
      if (drag.axis === "x") drag.el.scrollLeft += delta;
      else drag.el.scrollTop += delta;
      const dt = Math.max(1, e.timeStamp - drag.t);
      drag.v = 0.8 * (delta / dt) + 0.2 * drag.v; // px/ms, suavizado
      drag.last = pos;
      drag.t = e.timeStamp;
      e.preventDefault();
    };

    const onUp = (e: PointerEvent) => {
      if (!e.isTrusted) return; // el «pointercancel» que mandamos nosotros
      if (drag) {
        const { el, axis } = drag;
        let v = drag.v * 16; // px por fotograma
        const step = () => {
          if (Math.abs(v) < 0.5) return;
          if (axis === "x") el.scrollLeft += v;
          else el.scrollTop += v;
          v *= 0.95;
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        // El clic que viene detrás del arrastre no debe pulsar nada.
        const eat = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        window.addEventListener("click", eat, { capture: true, once: true });
        setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 50);
        document.documentElement.classList.remove("drag-scrolling");
      }
      start = null;
      drag = null;
    };

    // Mientras se arrastra no se selecciona texto.
    const onSelect = (e: Event) => drag && e.preventDefault();

    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("pointermove", onMove, { capture: true, passive: false });
    window.addEventListener("pointerup", onUp, { capture: true });
    window.addEventListener("pointercancel", onUp, { capture: true });
    document.addEventListener("selectstart", onSelect);
    return () => {
      stopInertia();
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
      window.removeEventListener("pointercancel", onUp, { capture: true });
      document.removeEventListener("selectstart", onSelect);
    };
  }, []);
  return null;
}
