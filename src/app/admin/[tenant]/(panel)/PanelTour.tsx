"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markTourSeen, tourFor, tourSeen, WELCOME, type Tour, type TourStep } from "./tourSteps";

// Recorrido guiado: la primera vez que alguien entra al panel sale la
// bienvenida y, la primera vez que entra en cada sección, su recorrido. Una
// nube señala cada parte (el resto se oscurece) con «Atrás», «Siguiente» y
// «Saltar». Se recuerda en el dispositivo; se repite desde Ayuda
// («Ver el recorrido» → ?recorrido=1). Pasos en tourSteps.ts. Ver docs/RECORRIDO.md

const GAP = 12; // separación entre la zona señalada y la nube
const PAD = 6; // margen del recuadro iluminado

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  if (r.right <= 0 || r.left >= window.innerWidth) return false; // p. ej. el menú lateral escondido en el móvil
  const s = getComputedStyle(el);
  return s.visibility !== "hidden" && s.display !== "none";
}

// «selector::texto || otro» → el primer elemento visible que encaje.
export function findTarget(spec: string): HTMLElement | null {
  for (const part of spec.split("||").map((p) => p.trim())) {
    const [sel, text] = part.split("::");
    let list: HTMLElement[] = [];
    try {
      list = [...document.querySelectorAll<HTMLElement>(sel)];
    } catch {
      continue;
    }
    const want = text?.trim().toLowerCase();
    const hit = list.find((el) => visible(el) && (!want || (el.textContent ?? "").toLowerCase().includes(want)));
    if (hit) return hit;
  }
  return null;
}

// Hay otra ventana encima (abrir la caja, un aviso…) o la animación de entrada.
const busy = () => [...document.querySelectorAll(".nsplash")].some(visible) || [...document.querySelectorAll('[aria-modal="true"]')].some((d) => !d.closest("[data-tour-ui]"));

type Pos = { top: number; left: number; arrow: { side: "top" | "bottom" | "left" | "right"; at: number } | null; hole: DOMRect | null };

export default function PanelTour({ tenant }: { tenant: string }) {
  const pathname = usePathname();
  const [run, setRun] = useState<{ tour: Tour; steps: TourStep[]; then?: Tour } | null>(null);
  const [i, setI] = useState(0);
  const [pos, setPos] = useState<Pos | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);

  // Al entrar en una sección: ¿toca recorrido? Espera a que la pantalla esté lista.
  useEffect(() => {
    const section = tourFor(pathname, tenant);
    const forced = new URLSearchParams(window.location.search).get("recorrido") === "1";
    const queue: Tour[] = [];
    if (!tourSeen(WELCOME.key)) queue.push(WELCOME);
    if (section && (forced || !tourSeen(section.key))) queue.push(section);
    if (!queue.length) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      if (tries > 30) return window.clearInterval(timer); // 20 s: la pantalla no se cargó, otra vez será
      if (busy() || document.hidden) return;
      const [first, second] = queue;
      const steps = first.steps.filter((s) => !s.target || findTarget(s.target));
      // Hace falta que se vea al menos un paso con su elemento (la pantalla ya cargó).
      if (!steps.some((s) => s.target)) return;
      window.clearInterval(timer);
      setI(0);
      setRun({ tour: first, steps, then: second });
    }, 700);
    return () => {
      window.clearInterval(timer);
      setRun(null);
    };
  }, [pathname, tenant]);

  const finish = useCallback(() => {
    if (!run) return;
    markTourSeen(run.tour.key);
    const then = run.then;
    setRun(null);
    setPos(null);
    if (then) {
      const steps = then.steps.filter((s) => !s.target || findTarget(s.target));
      if (steps.length) {
        setI(0);
        setRun({ tour: then, steps });
      }
    }
    // Quita ?recorrido=1 de la dirección para que no vuelva a salir al recargar.
    const url = new URL(window.location.href);
    if (url.searchParams.has("recorrido")) {
      url.searchParams.delete("recorrido");
      window.history.replaceState(null, "", url.toString());
    }
  }, [run]);

  const step = run?.steps[i];

  // Coloca la nube junto a su elemento (abajo, arriba, a la derecha o a la izquierda).
  const place = useCallback(() => {
    if (!step || !bubble.current) return;
    const el = step.target ? findTarget(step.target) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Tamaño real de la nube (sin la animación de entrada, que la encoge un poco).
    const b = { width: bubble.current.offsetWidth, height: bubble.current.offsetHeight };
    if (!el) {
      setPos({ top: Math.max(16, (vh - b.height) / 2), left: Math.max(16, (vw - b.width) / 2), arrow: null, hole: null });
      return;
    }
    const r = el.getBoundingClientRect();
    const clampX = (x: number) => Math.min(Math.max(16, x), vw - b.width - 16);
    const clampY = (y: number) => Math.min(Math.max(16, y), vh - b.height - 16);
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let p: Pos;
    if (r.bottom + PAD + GAP + b.height <= vh - 16) {
      const left = clampX(cx - b.width / 2);
      p = { top: r.bottom + PAD + GAP, left, arrow: { side: "top", at: cx - left }, hole: r };
    } else if (r.top - PAD - GAP - b.height >= 16) {
      const left = clampX(cx - b.width / 2);
      p = { top: r.top - PAD - GAP - b.height, left, arrow: { side: "bottom", at: cx - left }, hole: r };
    } else if (r.right + PAD + GAP + b.width <= vw - 16) {
      const top = clampY(cy - b.height / 2);
      p = { top, left: r.right + PAD + GAP, arrow: { side: "left", at: cy - top }, hole: r };
    } else if (r.left - PAD - GAP - b.width >= 16) {
      const top = clampY(cy - b.height / 2);
      p = { top, left: r.left - PAD - GAP - b.width, arrow: { side: "right", at: cy - top }, hole: r };
    } else {
      // No cabe al lado: abajo del todo, sin flecha.
      p = { top: vh - b.height - 16, left: clampX((vw - b.width) / 2), arrow: null, hole: r };
    }
    if (p.arrow) p.arrow.at = Math.min(Math.max(18, p.arrow.at), (p.arrow.side === "top" || p.arrow.side === "bottom" ? b.width : b.height) - 18);
    setPos(p);
  }, [step]);

  // Cada paso: lleva su elemento a la vista y coloca la nube.
  useLayoutEffect(() => {
    if (!step) return;
    const el = step.target ? findTarget(step.target) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 80) el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    }
    place();
    next.current?.focus({ preventScroll: true });
  }, [step, place]);

  useEffect(() => {
    if (!run) return;
    const onMove = () => place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") setI((n) => (n + 1 < run.steps.length ? n + 1 : n));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [run, place, finish]);

  if (!run || !step) return null;
  const last = i === run.steps.length - 1;
  const hole = pos?.hole;
  const arrowCls = {
    top: "left-0 -top-1.5",
    bottom: "left-0 -bottom-1.5",
    left: "top-0 -left-1.5",
    right: "top-0 -right-1.5",
  };

  return createPortal(
    <div data-tour-ui className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Recorrido: ${step.title}`}>
      {/* Fondo: bloquea la pantalla mientras dura el recorrido */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {hole ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] ring-2 ring-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{ top: hole.top - PAD, left: hole.left - PAD, width: hole.width + PAD * 2, height: hole.height + PAD * 2 }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-black/55" />
      )}
      <div
        ref={bubble}
        key={`${run.tour.key}-${i}`}
        className="p-pop absolute w-[min(340px,calc(100vw-32px))] rounded-2xl bg-[var(--p-surface)] p-4 text-[var(--p-ink)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)]"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      >
        {pos?.arrow && (
          <span
            aria-hidden
            className={`absolute h-3 w-3 rotate-45 rounded-[2px] bg-[var(--p-surface)] ${arrowCls[pos.arrow.side]}`}
            style={pos.arrow.side === "top" || pos.arrow.side === "bottom" ? { left: pos.arrow.at - 6 } : { top: pos.arrow.at - 6 }}
          />
        )}
        <div className="relative">
          <p className="text-xs font-semibold text-[var(--p-brand)]">
            {i + 1} de {run.steps.length}
          </p>
          <h2 className="mt-0.5 text-[17px] font-semibold leading-snug">{step.title}</h2>
          <p className="mt-1 text-[15px] leading-relaxed text-[var(--p-muted)]">{step.text}</p>
          {last && (
            <Link href={`/admin/${tenant}/ayuda#${run.tour.manual}`} onClick={finish} className="mt-2 inline-block text-sm font-semibold text-[var(--p-brand)] underline underline-offset-2">
              Más en Ayuda ↗
            </Link>
          )}
          <div className="mt-4 flex items-center gap-2">
            <button type="button" onClick={finish} className="min-h-11 rounded-full px-3 text-sm font-medium text-[var(--p-muted)] hover:bg-black/[0.05]">
              Saltar
            </button>
            <span className="flex-1" />
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="p-press min-h-11 rounded-full bg-black/[0.05] px-4 text-sm font-semibold">
                Atrás
              </button>
            )}
            <button ref={next} type="button" onClick={() => (last ? finish() : setI(i + 1))} className="p-press min-h-11 rounded-full bg-[var(--p-brand)] px-5 text-sm font-semibold text-[var(--p-on-brand)]">
              {last ? "¡Entendido!" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.querySelector(".panel") ?? document.body
  );
}
