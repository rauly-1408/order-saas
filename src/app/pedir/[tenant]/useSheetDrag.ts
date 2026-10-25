"use client";

import { useCallback, useRef } from "react";

// Cerrar una hoja deslizándola hacia abajo, como en iOS. Solo en el móvil (en
// el ordenador la hoja va centrada). La hoja sigue al dedo 1:1 desde donde se
// agarró, resiste si se tira hacia arriba, y al soltar se proyecta la inercia
// del dedo: si «va a caer» lejos, se cierra; si no, vuelve a su sitio.
// Se agarra por la cabecera (no por el contenido, que tiene su propio scroll).

const THRESHOLD = 8; // px antes de decidir que es un arrastre (no un toque)
const DECELERATION = 0.998; // la del desplazamiento normal de iOS

// Punto donde acabaría el gesto con su velocidad (px/s), como el scroll.
const project = (v: number) => ((v / 1000) * DECELERATION) / (1 - DECELERATION);
// Resistencia progresiva al pasar del límite (no un tope seco).
const rubberband = (over: number, dim: number, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

export function useSheetDrag(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLElement | null>(null);
  const state = useRef<{ id: number; startY: number; dragging: boolean; samples: { y: number; t: number }[] } | null>(null);

  const enabled = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;
  const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setY = (y: number, transition = "") => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = y ? `translateY(${y}px)` : "";
    const b = backdropRef.current;
    if (b) {
      b.style.transition = transition ? "opacity 220ms ease" : "";
      b.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / (el.offsetHeight || 1)));
    }
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled() || e.button !== 0) return;
    state.current = { id: e.pointerId, startY: e.clientY, dragging: false, samples: [{ y: e.clientY, t: e.timeStamp }] };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = state.current;
    const el = panelRef.current;
    if (!s || !el || e.pointerId !== s.id) return;
    const dy = e.clientY - s.startY;
    if (!s.dragging) {
      if (Math.abs(dy) < THRESHOLD) return;
      s.dragging = true;
      el.style.animation = "none"; // la animación de entrada fija el transform: se suelta
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    s.samples.push({ y: e.clientY, t: e.timeStamp });
    if (s.samples.length > 6) s.samples.shift();
    setY(dy >= 0 ? dy : rubberband(dy, el.offsetHeight));
  }, []);

  const end = useCallback(
    (e: React.PointerEvent) => {
      const s = state.current;
      const el = panelRef.current;
      state.current = null;
      if (!s || !el || !s.dragging) return;
      const dy = e.clientY - s.startY;
      const first = s.samples[0];
      const last = s.samples[s.samples.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const velocity = ((last.y - first.y) / dt) * 1000; // px/s
      const landing = dy + project(velocity);
      const close = velocity > 0 && landing > el.offsetHeight * 0.4;
      if (close) {
        if (reduced()) return onClose();
        setY(el.offsetHeight + 40, "transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1)");
        window.setTimeout(onClose, 200);
      } else {
        setY(0, reduced() ? "" : "transform 320ms cubic-bezier(0.2, 0.9, 0.3, 1)");
      }
    },
    [onClose]
  );

  const setPanel = useCallback((el: HTMLDivElement | null) => {
    panelRef.current = el;
  }, []);
  // El fondo oscuro se aclara al arrastrar.
  const setBackdrop = useCallback((el: HTMLElement | null) => {
    backdropRef.current = el;
  }, []);

  // Para la zona por la que se agarra (cabecera y tirador); añadir la clase touch-none.
  return { setPanel, setBackdrop, onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end };
}
