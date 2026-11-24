"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PrintPreviewItem } from "@/app/lib/printing";

// Reimprimir comanda o ticket con vista previa: se ve el papel tal como saldrá
// (los mismos bytes que van a la impresora), en qué impresora y, al imprimir,
// si de verdad ha salido. Con «Imprimir sin vista previa» (Configuración →
// Impresoras) imprime al primer toque. Lo usan Pedidos y la Caja (tickets y
// también los cierres de caja: el del día, resumen o detallado, y cada turno).
// Ver docs/IMPRESION.md

type Kind = "KITCHEN" | "RECEIPT";
type Job = { id: string; status: "PENDING" | "PRINTED" | "FAILED"; error: string | null };
type Phase = { step: "loading" } | { step: "ready" } | { step: "sending" } | { step: "waiting"; jobs: string[]; since: number; slow: boolean } | { step: "done" } | { step: "failed"; text: string };

const TITLE: Record<Kind, string> = { KITCHEN: "Comanda", RECEIPT: "Ticket" };
// Un informe de caja ya cerrado: el del día (Z) o el de un turno (X).
export type CashReportRef = { sessionId: string; detailed?: boolean } | { shiftId: string };
// Qué se imprime: de dónde sale la vista previa, cómo se manda y cómo se sigue.
type Target = { key: string; title: string; label?: string; previewUrl: string; postUrl: string; body: Record<string, unknown>; jobsUrl: (ids: string[]) => string; sent: string };
const POLL_MS = 1500;
const SLOW_MS = 15_000; // sin noticias del agente: probablemente el PC del local está apagado
const GIVE_UP_MS = 60_000;

export function usePrintPreview(tenant: string) {
  const [target, setTarget] = useState<Target | null>(null);
  // Se recuerda si el local imprime sin vista previa para no enseñar la ventana ni un instante.
  const skip = useRef<boolean | null>(null);
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  const quickPrint = useCallback(async (t: Target) => {
    const res = await fetch(t.postUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t.body) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    setFlash(res?.ok ? { text: t.sent, ok: true } : { text: data?.error ?? "Sin conexión. No se pudo imprimir.", ok: false });
  }, []);

  const open = useCallback(
    (t: Target) => {
      if (skip.current) return void quickPrint(t);
      setTarget(t);
    },
    [quickPrint]
  );

  // Comanda o ticket de un pedido.
  const print = useCallback(
    (orderId: string, kind: Kind, label?: string) => {
      const api = `/api/admin/${tenant}/print/${orderId}`;
      open({ key: `${orderId}-${kind}`, title: TITLE[kind], label, previewUrl: `${api}?kind=${kind}`, postUrl: api, body: { kind }, jobsUrl: (ids) => `${api}?jobs=${ids.join(",")}`, sent: `${TITLE[kind]} enviada a la impresora` });
    },
    [tenant, open]
  );

  // Cierre de caja: el del día (resumen o detallado) o un turno.
  const printReport = useCallback(
    (rep: CashReportRef, label?: string) => {
      const api = `/api/admin/${tenant}/caja/informe`;
      const isShift = "shiftId" in rep;
      const q = isShift ? `shift=${rep.shiftId}` : `session=${rep.sessionId}${rep.detailed ? "&detailed=1" : ""}`;
      const title = isShift ? "Cierre de turno (X)" : rep.detailed ? "Cierre del día (Z) detallado" : "Cierre del día (Z)";
      open({ key: q, title, label, previewUrl: `${api}?${q}`, postUrl: api, body: { ...rep }, jobsUrl: (ids) => `${api}?jobs=${ids.join(",")}`, sent: "Cierre enviado a la impresora" });
    },
    [tenant, open]
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  // Se pinta en la raíz del panel: dentro de la página, la animación de entrada (p-page)
  // hace que «fixed» se mida contra el contenido y no contra la pantalla.
  const node = !(target || flash) || typeof document === "undefined" ? null : createPortal(
    <>
      {target && (
        <PrintPreviewDialog
          key={target.key}
          target={target}
          onClose={() => setTarget(null)}
          onSkip={() => {
            skip.current = true;
            setTarget(null);
            void quickPrint(target);
          }}
          onLoaded={() => (skip.current = false)}
        />
      )}
      {flash && (
        <div role="status" className={`fixed bottom-[max(24px,env(safe-area-inset-bottom))] left-1/2 z-[60] -translate-x-1/2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${flash.ok ? "bg-[var(--p-ink)]" : "bg-red-600"}`}>
          {flash.ok ? "✓ " : ""}
          {flash.text}
        </div>
      )}
    </>,
    // En la raíz del panel (lleva los colores del restaurante), fuera de la página animada.
    document.querySelector(".panel") ?? document.body
  );
  return { print, printReport, node };
}

function PrintPreviewDialog({ target, onClose, onSkip, onLoaded }: { target: Target; onClose: () => void; onSkip: () => void; onLoaded: () => void }) {
  const { title, label } = target;
  const [items, setItems] = useState<PrintPreviewItem[]>([]);
  const [phase, setPhase] = useState<Phase>({ step: "loading" });
  const [loadError, setLoadError] = useState("");
  const printBtn = useRef<HTMLButtonElement>(null);

  // Vista previa (y si el local imprime sin ella).
  useEffect(() => {
    let off = false;
    (async () => {
      const res = await fetch(target.previewUrl, { cache: "no-store" }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { error?: string; skipPreview?: boolean; items?: PrintPreviewItem[] } | undefined;
      if (off) return;
      if (!res?.ok || !data?.items) {
        setLoadError(data?.error ?? "Sin conexión. No se pudo preparar la vista previa.");
        setPhase({ step: "ready" });
        return;
      }
      if (data.skipPreview) return onSkip();
      onLoaded();
      setItems(data.items);
      setPhase({ step: "ready" });
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al abrir
  }, []);

  // «Imprimir» listo para tocar o pulsar Intro; Escape cierra.
  useEffect(() => {
    if (phase.step === "ready" && items.length) printBtn.current?.focus();
  }, [phase.step, items.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    setPhase({ step: "sending" });
    const res = await fetch(target.postUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target.body) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { error?: string; jobs?: string[] } | undefined;
    if (!res?.ok || !data?.jobs?.length) return setPhase({ step: "failed", text: data?.error ?? "Sin conexión. No se pudo enviar a la impresora." });
    setPhase({ step: "waiting", jobs: data.jobs, since: Date.now(), slow: false });
  }

  // Seguir los trabajos hasta que el agente del local los imprima (o falle).
  const waitingJobs = phase.step === "waiting" ? phase.jobs : null;
  const since = phase.step === "waiting" ? phase.since : 0;
  useEffect(() => {
    if (!waitingJobs) return;
    const t = setInterval(async () => {
      const res = await fetch(target.jobsUrl(waitingJobs), { cache: "no-store" }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { jobs?: Job[] } | undefined;
      const jobs = data?.jobs ?? [];
      const failed = jobs.find((j) => j.status === "FAILED");
      const elapsed = Date.now() - since;
      if (failed) setPhase({ step: "failed", text: `La impresora no responde${failed.error ? ` (${failed.error})` : ""}. Revisa que esté encendida y con papel.` });
      else if (jobs.length && jobs.every((j) => j.status === "PRINTED")) setPhase({ step: "done" });
      else if (elapsed > GIVE_UP_MS) setPhase({ step: "failed", text: "La impresora no lo ha recogido. ¿Está encendido el ordenador del local con el programa de impresión?" });
      else if (elapsed > SLOW_MS) setPhase((p) => (p.step === "waiting" && !p.slow ? { ...p, slow: true } : p));
    }, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target no cambia mientras está abierta
  }, [waitingJobs, since]);

  // Impreso: se cierra solo enseguida.
  useEffect(() => {
    if (phase.step !== "done") return;
    const t = setTimeout(onClose, 1200);
    return () => clearTimeout(t);
  }, [phase.step, onClose]);

  const printers = items.map((i) => i.printer + (i.copies > 1 ? ` (${i.copies} copias)` : ""));
  const busy = phase.step === "sending" || phase.step === "waiting";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 lg:items-center lg:p-6" role="dialog" aria-modal="true" aria-label={`${title}: vista previa`}>
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" />
      <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45)] lg:max-h-[88dvh] lg:max-w-[420px] lg:rounded-[24px]">
        <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15 lg:hidden" />
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">
              {title}
              {label ? <span className="font-normal text-[var(--p-muted)]"> · {label}</span> : null}
            </h2>
            <p className="text-xs text-[var(--p-muted)]">{printers.length ? `Se imprimirá en: ${printers.join(", ")}` : phase.step === "loading" ? "Preparando la vista previa…" : ""}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-[var(--p-muted)] hover:bg-black/[0.08]">
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* El papel */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto bg-[var(--p-bg)] px-4 py-5">
          {loadError ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
          ) : phase.step === "loading" ? (
            <div className="mx-auto h-72 w-full max-w-[340px] animate-pulse rounded-sm bg-white shadow-sm" />
          ) : (
            <div className="space-y-5">
              {items.map((it, i) => (
                <div key={i}>
                  {items.length > 1 && <p className="mb-1.5 text-center text-xs font-semibold text-[var(--p-muted)]">{it.printer}</p>}
                  <Paper item={it} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Estado y botones */}
        <div className="border-t border-[var(--p-line)] px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
          {phase.step === "waiting" && (
            <p className="mb-2 text-sm text-[var(--p-muted)]" role="status">
              {phase.slow ? "Sigue en cola: la impresora aún no lo ha recogido. ¿Está encendido el ordenador del local?" : "Imprimiendo…"}
            </p>
          )}
          {phase.step === "done" && (
            <p className="mb-2 text-sm font-semibold text-emerald-700" role="status">
              ✓ Impreso
            </p>
          )}
          {phase.step === "failed" && (
            <p className="mb-2 text-sm text-red-700" role="alert">
              {phase.text}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="p-press min-h-12 flex-1 rounded-full bg-black/[0.05] px-4 text-[15px] font-semibold hover:bg-black/[0.08]">
              Cerrar
            </button>
            {!loadError && (
              <button
                ref={printBtn}
                type="button"
                onClick={send}
                disabled={busy || phase.step === "loading" || phase.step === "done"}
                className="p-press min-h-12 flex-[2] rounded-full bg-[var(--p-brand)] px-4 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                {phase.step === "failed" ? "Reintentar" : busy ? "Imprimiendo…" : phase.step === "done" ? "Impreso" : "Imprimir"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Puntos por línea de cada papel (igual que en lib/printLogo.ts).
const DOTS: Record<number, number> = { 48: 576, 42: 512, 32: 384 };

// Papel térmico: tantas columnas como caracteres por línea tiene la impresora.
function Paper({ item }: { item: PrintPreviewItem }) {
  return (
    <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-sm bg-white px-3 py-4 text-black shadow-[0_1px_3px_rgba(0,0,0,0.12)]">
      {/* El tamaño de letra se ajusta para que quepa una línea entera (monoespaciada ≈ 0,6 em por carácter). */}
      <div className="font-mono leading-[1.35] [container-type:inline-size]">
        <div style={{ fontSize: `calc(100cqw / ${item.width * 0.6})` }}>
          {item.preview.lines.map((l, i) => {
            if (l.type === "feed") return <div key={i} style={{ height: `${Math.min(l.lines, 4) * 1.35}em` }} aria-hidden />;
            if (l.type === "cut")
              return (
                <div key={i} className="my-2 flex items-center gap-1 text-[10px] text-black/40" aria-label="Corte del papel">
                  <span aria-hidden>✂</span>
                  <span className="flex-1 border-t border-dashed border-black/25" />
                </div>
              );
            if (l.type === "qr") return l.svg ? <div key={i} className="mx-auto my-1 w-[38%]" dangerouslySetInnerHTML={{ __html: l.svg }} /> : null;
            if (l.type === "image")
              return l.src ? (
                <div key={i} className={`flex ${l.align === "center" ? "justify-center" : l.align === "right" ? "justify-end" : "justify-start"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- PNG generado al momento */}
                  <img src={l.src} alt="Logo" className="block" style={{ width: `${(l.width / (DOTS[item.width] ?? 576)) * 100}%` }} />
                </div>
              ) : null;
            const align = l.align === "center" ? "text-center" : l.align === "right" ? "text-right" : "text-left";
            if (l.tall && l.wide)
              return (
                <div key={i} className={`whitespace-pre text-[2em] leading-[1.2] ${align} ${l.bold ? "font-bold" : ""}`}>
                  {l.text || " "}
                </div>
              );
            if (l.tall)
              return (
                <div key={i} className={`h-[2.7em] whitespace-pre ${align} ${l.bold ? "font-bold" : ""}`}>
                  <span className="inline-block origin-top scale-y-[2]">{l.text || " "}</span>
                </div>
              );
            return (
              <div key={i} className={`whitespace-pre-wrap break-all ${align} ${l.bold ? "font-bold" : ""}`}>
                {l.text || " "}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
