"use client";

import { speechCtor, type Recognition } from "@/app/lib/speech";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ChatMessage, PendingAction } from "@/app/lib/assistant";
import RichText from "./RichText";

// NORA («pregúntale al panel»): el dueño pregunta (escribiendo o con el micro) y la IA
// responde con los datos del restaurante. Los cambios que propone (agotar o
// reponer un producto) solo se hacen al tocar el botón. Se abre con la burbuja
// flotante de abajo a la derecha (como un chat de ayuda) o con el evento
// OPEN_EVENT. En el ordenador la ventana sale de la burbuja y no tapa el panel;
// en el móvil ocupa casi toda la pantalla. Cada respuesta se puede valorar
// con 👍/👎 y las preguntas más hechas pasan a ser las sugerencias: así NORA
// aprende de cada restaurante. Ver docs/ASISTENTE.md

export const OPEN_EVENT = "norapp:asistente";
export const openAssistant = () => window.dispatchEvent(new Event(OPEN_EVENT));

type Turn = ChatMessage & { actions?: PendingAction[]; questionId?: string | null };
type Vote = "up" | "down";
type ActionState = "idle" | "busy" | "done" | "error";

// Pantallas con su propia barra abajo (cuenta de mesa, caja, cocina): ahí la
// burbuja taparía botones, así que no se enseña.
const NO_BUBBLE = ["/mesas", "/caja", "/cocina"];

const noopSubscribe = () => () => {};

const SUGGESTIONS = ["¿Cuánto llevo vendido hoy?", "¿Qué se ha vendido más esta semana?", "¿Qué ingredientes están bajo mínimos?", "¿Cómo pongo un producto como agotado?"];

export function SparkIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

export default function Assistant({ tenant }: { tenant: string }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [acts, setActs] = useState<Record<string, ActionState>>({});
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [suggestions, setSuggestions] = useState<string[]>(SUGGESTIONS);
  const loaded = useRef(false);
  const rec = useRef<Recognition | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  // En el servidor no se pinta nada; en el navegador, ya hidratado, sí.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const showBubble = !NO_BUBBLE.some((p) => pathname.startsWith(`/admin/${tenant}${p}`));

  // Los avisos de pedidos (abajo a la derecha) suben para no tapar la burbuja.
  useEffect(() => {
    document.documentElement.classList.toggle("has-fab", showBubble);
    return () => document.documentElement.classList.remove("has-fab");
  }, [showBubble]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Sugerencias aprendidas: lo que más se pregunta en este restaurante.
  useEffect(() => {
    if (!open || loaded.current) return;
    loaded.current = true;
    fetch(`/api/admin/${tenant}/assistant`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { suggestions?: string[] } | null) => d?.suggestions?.length && setSuggestions(d.suggestions))
      .catch(() => {});
  }, [open, tenant]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // En pantallas con teclado físico se puede escribir al momento; en el móvil no se abre el teclado solo.
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const next: Turn[] = [...turns, { role: "user", text: q }];
      setTurns(next);
      setDraft("");
      setError("");
      setBusy(true);
      const res = await fetch(`/api/admin/${tenant}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map(({ role, text }) => ({ role, text })) }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { reply?: string; actions?: PendingAction[]; questionId?: string | null; error?: string } | undefined;
      setBusy(false);
      if (!res?.ok || !data?.reply) {
        setError(data?.error ?? "Sin conexión. Revisa internet e inténtalo de nuevo.");
        setTurns(turns); // se quita la pregunta para poder repetirla
        setDraft(q);
        return;
      }
      setTurns([...next, { role: "assistant", text: data.reply, actions: data.actions, questionId: data.questionId }]);
    },
    [busy, tenant, turns]
  );

  async function apply(a: PendingAction) {
    setActs((s) => ({ ...s, [a.productId]: "busy" }));
    const res = await fetch(`/api/admin/${tenant}/products/${a.productId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isAvailable: a.available }) }).catch(() => null);
    setActs((s) => ({ ...s, [a.productId]: res?.ok ? "done" : "error" }));
  }

  function vote(questionId: string, v: Vote) {
    if (votes[questionId]) return;
    setVotes((s) => ({ ...s, [questionId]: v }));
    void fetch(`/api/admin/${tenant}/assistant/valorar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId, helpful: v === "up" }) }).catch(() => {});
  }

  function toggleMic() {
    if (listening) return rec.current?.stop();
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "es-ES";
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
      if (said) void ask(said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setError("No te he oído bien. Prueba otra vez o escríbelo.");
    };
    rec.current = r;
    setError("");
    setListening(true);
    r.start();
  }

  // Burbuja: en el móvil se esconde con la ventana abierta (la ventana ocupa la
  // pantalla); en el ordenador se queda y pasa a ser la ✕ para cerrar.
  const bubble = showBubble && (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-label={open ? "Cerrar NORA" : "Pregúntale a NORA"}
      aria-expanded={open}
      className={`p-press fixed right-4 [.pedido-abierto_&]:!hidden bottom-[max(16px,env(safe-area-inset-bottom))] z-[65] h-14 items-center justify-center gap-2 rounded-full bg-[var(--p-brand)] text-white shadow-[0_12px_30px_-8px_rgba(0,0,0,0.45)] ring-1 ring-black/5 transition-[bottom] duration-300 sm:right-5 sm:bottom-5 [.has-savebar_&]:bottom-[max(112px,calc(env(safe-area-inset-bottom)+104px))] ${open ? "hidden w-14 sm:flex" : "flex w-14 lg:w-auto lg:px-5"}`}
    >
      {open ? (
        <svg viewBox="0 0 12 12" className="h-4 w-4" aria-hidden>
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        <>
          <SparkIcon className="h-6 w-6" />
          <span className="hidden text-[15px] font-semibold tracking-wide lg:inline">NORA</span>
        </>
      )}
    </button>
  );

  if (!mounted) return null;
  const host = document.querySelector(".panel") ?? document.body;
  if (!open) return bubble ? createPortal(bubble, host) : null;
  // Solo se pinta en el navegador (cerrado al cargar), así que se puede mirar aquí.
  const canSpeak = !!speechCtor();
  return createPortal(
    <>
    {bubble}
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:pointer-events-none sm:inset-auto sm:right-5 sm:bottom-[92px] [.has-savebar_&]:sm:bottom-[188px]" role="dialog" aria-modal="false" aria-label="NORA, tu asistente">
      <button type="button" aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/45 backdrop-blur-[2px] sm:hidden" />
      <div className="p-pop relative flex h-[88dvh] w-full origin-bottom-right flex-col overflow-hidden rounded-t-[24px] bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5 sm:pointer-events-auto sm:h-[min(640px,calc(100dvh-120px))] sm:w-[400px] sm:rounded-[24px]">
        <div aria-hidden className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-black/15 sm:hidden" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--p-brand)] text-white">
              <SparkIcon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-tight tracking-wide">NORA</h2>
              <p className="truncate text-xs text-[var(--p-muted)]">Tu asistente · ventas, carta, stock y cómo se hace</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {turns.length > 0 && (
              <button type="button" onClick={() => { setTurns([]); setError(""); setActs({}); setVotes({}); }} className="rounded-full px-3 py-2 text-xs font-semibold text-[var(--p-muted)] hover:bg-black/[0.05]">
                Nueva
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.05] text-[var(--p-muted)] hover:bg-black/[0.08]">
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[var(--p-bg)] px-4 py-4" aria-live="polite">
          {turns.length === 0 && !busy && (
            <div className="pt-2">
              <p className="px-1 text-[15px] font-semibold">Hola, soy NORA.</p>
              <p className="mt-0.5 px-1 text-sm text-[var(--p-muted)]">Pregúntame como se lo dirías a tu encargado: tus números o cómo se hace algo en el panel.</p>
              <div className="mt-3 grid gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => void ask(s)} className="p-press rounded-2xl bg-[var(--p-surface)] px-4 py-3 text-left text-[15px] font-medium shadow-sm ring-1 ring-[var(--p-line)] hover:ring-[var(--p-brand)]">
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-4 px-1 text-xs text-[var(--p-muted)]">También puedo agotar o volver a poner a la venta un producto: te lo propongo y lo confirmas tú. Marca 👍 o 👎 en mis respuestas y aprenderé qué te sirve.</p>
            </div>
          )}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-[var(--p-brand)] px-4 py-2.5 text-[15px] text-white">{t.text}</p>
              </div>
            ) : (
              <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md bg-[var(--p-surface)] px-4 py-3 text-[15px] leading-relaxed shadow-sm ring-1 ring-[var(--p-line)]">
                <RichText text={t.text} tenant={tenant} onNavigate={() => window.matchMedia("(max-width: 639px)").matches && setOpen(false)} />
                {t.actions?.map((a) => {
                  const st = acts[a.productId] ?? "idle";
                  return (
                    <div key={a.productId} className="mt-3 rounded-xl bg-[var(--p-bg)] p-3">
                      {st === "done" ? (
                        <p className="text-sm font-semibold text-emerald-700">✓ {a.available ? `«${a.productName}» vuelve a estar a la venta` : `«${a.productName}» agotado`}</p>
                      ) : (
                        <>
                          <button type="button" disabled={st === "busy"} onClick={() => void apply(a)} className={`p-press w-full rounded-xl px-4 py-3 text-[15px] font-semibold text-white disabled:opacity-60 ${a.available ? "bg-[var(--p-brand)]" : "bg-red-600"}`}>
                            {st === "busy" ? "Guardando…" : a.available ? `Poner a la venta «${a.productName}»` : `Agotar «${a.productName}»`}
                          </button>
                          {st === "error" && <p className="mt-2 text-sm text-red-700">No se ha podido guardar. Inténtalo de nuevo.</p>}
                        </>
                      )}
                    </div>
                  );
                })}
                {t.questionId && (
                  <div className="mt-2 -mb-1 flex items-center gap-1 text-[var(--p-muted)]">
                    {votes[t.questionId] ? (
                      <p className="text-xs">{votes[t.questionId] === "up" ? "¡Gracias! Lo tendré en cuenta." : "Gracias. La próxima vez lo responderé mejor."}</p>
                    ) : (
                      <>
                        <span className="mr-1 text-xs">¿Te ha servido?</span>
                        {(["up", "down"] as const).map((v) => (
                          <button key={v} type="button" onClick={() => vote(t.questionId!, v)} aria-label={v === "up" ? "Me ha servido" : "No me ha servido"} className="p-press flex h-9 w-9 items-center justify-center rounded-full text-base hover:bg-black/[0.05]">
                            {v === "up" ? "👍" : "👎"}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          )}
          {busy && (
            <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-[var(--p-surface)] px-4 py-3.5 shadow-sm ring-1 ring-[var(--p-line)]" role="status" aria-label="Pensando">
              {["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"].map((d) => (
                <span key={d} className={`h-2 w-2 animate-bounce rounded-full bg-[var(--p-muted)] ${d}`} />
              ))}
            </div>
          )}
          {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void ask(draft);
          }}
          className="flex items-end gap-2 border-t border-[var(--p-line)] px-3 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
        >
          {canSpeak && (
            <button type="button" onClick={toggleMic} disabled={busy} aria-label={listening ? "Dejar de escuchar" : "Preguntar con la voz"} aria-pressed={listening} className={`p-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${listening ? "animate-pulse bg-red-600 text-white" : "bg-black/[0.05] text-[var(--p-ink)]"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5" aria-hidden>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0014 0M12 18v3" />
              </svg>
            </button>
          )}
          <textarea
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void ask(draft);
              }
            }}
            rows={1}
            placeholder={listening ? "Te escucho…" : "Escribe tu pregunta"}
            aria-label="Tu pregunta"
            className="max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-3xl bg-black/[0.04] px-4 py-3 text-[16px] outline-none focus:ring-2 focus:ring-[var(--p-brand)]"
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Preguntar" className="p-press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--p-brand)] text-white disabled:opacity-40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
    </>,
    host
  );
}
