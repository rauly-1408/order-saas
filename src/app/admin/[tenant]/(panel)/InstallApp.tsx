"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Botón "Instalar como app". Instalada, la app abre en su propia ventana y puede
// sonar al entrar un pedido sin tocarla antes.
// - Chrome/Edge en ordenador y Android: el navegador avisa (beforeinstallprompt)
//   y el botón abre su ventana de instalar.
// - iPhone y iPad: no hay aviso ni ventana; el botón enseña los pasos con el
//   botón Compartir del navegador («Añadir a pantalla de inicio»).
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type IosBrowser = "safari" | "chrome" | "other" | "inapp";

const noop = () => () => {};
// En el iPhone/iPad y aún no instalada: qué navegador es (null si no toca).
function iosBrowser(): IosBrowser | null {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || window.matchMedia("(display-mode: standalone)").matches;
  if (!ios || standalone) return null;
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\//.test(ua)) return "inapp";
  if (/CriOS/.test(ua)) return "chrome";
  if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return "other";
  return "safari";
}

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline h-5 w-5 -translate-y-0.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Compartir">
    <path d="M12 15V3M8 7l4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);

function IosSteps({ browser, onClose }: { browser: IosBrowser; onClose: () => void }) {
  const steps: React.ReactNode[] =
    browser === "inapp"
      ? [
          <>Estás dentro de otra app (WhatsApp, Instagram…), que no deja instalar.</>,
          <>Toca los tres puntos o «Abrir en el navegador» y elige <b>Safari</b>.</>,
          <>Allí toca <ShareIcon /> <b>Compartir</b> y luego <b>«Añadir a pantalla de inicio»</b>.</>,
        ]
      : browser === "chrome"
        ? [
            <>Toca <ShareIcon /> <b>Compartir</b>, arriba a la derecha de la barra de la dirección.</>,
            <>Baja y toca <b>«Añadir a la pantalla de inicio»</b>.</>,
            <>Toca <b>«Añadir»</b>. El panel queda como una app más en tu pantalla de inicio.</>,
          ]
        : [
            <>Toca <ShareIcon /> <b>Compartir</b>, en la barra de abajo (o arriba en el iPad).</>,
            <>Baja y toca <b>«Añadir a pantalla de inicio»</b>.</>,
            <>Toca <b>«Añadir»</b>. El panel queda como una app más en tu pantalla de inicio.</>,
          ];
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Instalar como app">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/45" />
      <div className="p-rise relative w-full max-w-md rounded-t-[24px] bg-[var(--p-surface)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--p-ink)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45)] sm:rounded-[24px]">
        <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15 sm:hidden" />
        <h2 className="text-lg font-semibold">Instalar el panel en este {/iPad/.test(navigator.userAgent) ? "iPad" : "iPhone"}</h2>
        <p className="mt-1 text-sm text-[var(--p-muted)]">Así se abre como una app, a pantalla completa y con los avisos de pedidos.</p>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-snug">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--p-brand)] text-sm font-semibold text-white">{i + 1}</span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        {browser === "other" && <p className="mt-3 text-xs text-[var(--p-muted)]">Si en tu navegador no sale esa opción, abre esta página en Safari y hazlo desde allí.</p>}
        <button type="button" onClick={onClose} className="p-press mt-5 w-full rounded-full bg-[var(--p-brand)] py-3.5 text-[15px] font-semibold text-white">
          Entendido
        </button>
      </div>
    </div>
  );
}

export default function InstallApp({ className }: { className: string }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [steps, setSteps] = useState(false);
  const ios = useSyncExternalStore(noop, iosBrowser, () => null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt && !ios) return null;
  return (
    <>
      <button
        onClick={async () => {
          if (!prompt) return setSteps(true);
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
        className={className}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
        Instalar como app
      </button>
      {steps && ios && createPortal(<IosSteps browser={ios} onClose={() => setSteps(false)} />, document.querySelector(".panel") ?? document.body)}
    </>
  );
}
