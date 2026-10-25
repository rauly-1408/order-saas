"use client";

import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

// Avisos propios en lugar de los del navegador (window.confirm): con el diseño
// de la app, en español y grandes para el dedo. Se usa igual en el panel y en
// la tienda: toma los colores del sitio desde donde se abre.
//
//   if (!(await ask("¿Borrar el menú «X»? Los pedidos ya hechos no cambian."))) return;
//
// El texto se parte solo: la pregunta (desde «¿») es el título y lo demás, la
// explicación. El botón se nombra con el verbo de la pregunta («Borrar»,
// «Sí, cancelar»…) y es rojo si la acción borra o deshace algo.

export type AskOptions = { confirm?: string; cancel?: string; danger?: boolean; title?: string; message?: string };

const VERBS: Record<string, { label: string; danger: boolean }> = {
  borrar: { label: "Borrar", danger: true },
  eliminar: { label: "Eliminar", danger: true },
  quitar: { label: "Quitar", danger: true },
  anular: { label: "Anular", danger: true },
  vaciar: { label: "Vaciar", danger: true },
  cancelar: { label: "Sí, cancelar", danger: true },
  salir: { label: "Salir sin guardar", danger: true },
  cambiar: { label: "Cambiar", danger: false },
  cerrar: { label: "Cerrar", danger: false },
  crear: { label: "Crear", danger: false },
  generar: { label: "Generar", danger: false },
  volver: { label: "Sí, volver", danger: true },
  dar: { label: "Dar de baja", danger: true },
};

// «Explicación. ¿Pregunta? Más explicación.» → título y mensaje.
export function splitQuestion(text: string): { title: string; message: string } {
  const start = text.indexOf("¿");
  const end = start >= 0 ? text.indexOf("?", start) : -1;
  if (start < 0 || end < 0) return { title: text.trim(), message: "" };
  const title = text.slice(start, end + 1).trim();
  const message = [text.slice(0, start), text.slice(end + 1)].map((s) => s.trim()).filter(Boolean).join(" ");
  return { title, message };
}

export function verbOf(title: string): { label: string; danger: boolean } | null {
  const w = title.replace(/^¿/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  return VERBS[w] ?? null;
}

// Colores del sitio donde se abre: el panel (.panel) o la tienda (su contenedor
// lleva las variables de la marca). No se fía del foco: Safari no enfoca un
// botón al tocarlo.
function themeSource(): Element {
  const active = document.activeElement;
  const has = (el: Element | null, n: string) => !!el && getComputedStyle(el).getPropertyValue(n).trim() !== "";
  if (active && active !== document.body && (has(active, "--p-surface") || has(active, "--brand-accent"))) return active;
  return document.querySelector(".panel") ?? document.querySelector('[style*="--brand-accent"]') ?? document.body;
}
function themeFrom(el: Element) {
  const cs = getComputedStyle(el);
  const v = (...names: string[]) => names.map((n) => cs.getPropertyValue(n).trim()).find(Boolean) ?? "";
  return {
    surface: v("--p-surface", "--surface-0") || "#ffffff",
    ink: v("--p-ink", "--text-primary") || "#1d1d1f",
    muted: v("--p-muted", "--text-secondary") || "#6e6e73",
    brand: v("--p-brand", "--brand-accent") || "#0d3328",
    onBrand: v("--on-accent") || "#ffffff",
    danger: "#d92d20",
    font: v("--font-body") || "inherit",
  };
}

let open = false;

export function ask(text: string, opts: AskOptions = {}): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (open) return Promise.resolve(false); // uno cada vez
  open = true;
  const split = splitQuestion(text);
  const verb = verbOf(opts.title ?? split.title);
  const en = document.documentElement.lang?.startsWith("en");
  const props = {
    title: opts.title ?? split.title,
    message: opts.message ?? split.message,
    confirm: opts.confirm ?? verb?.label ?? (en ? "OK" : "Aceptar"),
    cancel: opts.cancel ?? (en ? "Cancel" : "Cancelar"),
    danger: opts.danger ?? verb?.danger ?? false,
    theme: themeFrom(themeSource()),
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const prevFocus = document.activeElement as HTMLElement | null;
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      root.unmount();
      host.remove();
      open = false;
      prevFocus?.focus?.();
      resolve(ok);
    };
    root.render(<AskDialog {...props} onDone={done} />);
  });
}

function AskDialog({ title, message, confirm, cancel, danger, theme, onDone }: { title: string; message: string; confirm: string; cancel: string; danger: boolean; theme: ReturnType<typeof themeFrom>; onDone: (ok: boolean) => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Lo destructivo no se confirma con un Intro despistado: el foco va a «Cancelar».
    (danger ? cancelRef : okRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(false);
      if (e.key === "Tab") {
        const els = [cancelRef.current, okRef.current].filter(Boolean) as HTMLElement[];
        const i = els.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [danger, onDone]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-0 sm:items-center sm:p-6" style={{ fontFamily: theme.font }}>
      <button type="button" aria-label={cancel} onClick={() => onDone(false)} className="p-dialog-fade absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ask-title"
        aria-describedby={message ? "ask-msg" : undefined}
        className="p-dialog-rise relative w-full max-w-md rounded-t-[26px] px-6 pt-6 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] sm:rounded-[26px] sm:pb-6"
        style={{ backgroundColor: theme.surface, color: theme.ink }}
      >
        <div aria-hidden className="mx-auto mb-4 h-1.5 w-10 rounded-full opacity-20 sm:hidden" style={{ backgroundColor: theme.ink }} />
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold" style={{ backgroundColor: danger ? "#fde8e7" : `color-mix(in srgb, ${theme.brand} 12%, transparent)`, color: danger ? theme.danger : theme.brand }}>
            {danger ? "!" : "?"}
          </span>
          <div className="min-w-0">
            <h2 id="ask-title" className="text-[18px] font-semibold leading-snug">
              {title}
            </h2>
            {message && (
              <p id="ask-msg" className="mt-1.5 text-[15px] leading-relaxed" style={{ color: theme.muted }}>
                {message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={() => onDone(false)} className="p-press min-h-[48px] rounded-2xl px-5 text-[15px] font-semibold" style={{ backgroundColor: "rgba(0,0,0,0.06)", color: theme.ink }}>
            {cancel}
          </button>
          <button ref={okRef} type="button" onClick={() => onDone(true)} className="p-press min-h-[48px] rounded-2xl px-5 text-[15px] font-bold" style={{ backgroundColor: danger ? theme.danger : theme.brand, color: danger ? "#ffffff" : theme.onBrand }}>
            {confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
