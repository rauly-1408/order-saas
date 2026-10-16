"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FINAL_STATUSES, GOOGLE_REVIEW_MIN, statusNotice, trackingSteps, type TrackChannel } from "@/app/lib/tracking";

// Seguimiento en vivo del pedido (se actualiza solo), aviso en el móvil cuando
// cambia de estado y valoración al entregarlo. Usa las CSS vars del theme.

type Review = { rating: number; comment: string | null } | null;
type Props = { orderId: string; channel: TrackChannel; initialStatus: string; estimatedReadyAt: string | null; initialReview: Review; googleReviewUrl: string | null };

const POLL_MS = 10_000;

export default function OrderTracker({ orderId, channel, initialStatus, estimatedReadyAt, initialReview, googleReviewUrl: initialGoogle }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [review, setReview] = useState<Review>(initialReview);
  const [googleUrl, setGoogleUrl] = useState(initialGoogle);
  const last = useRef(initialStatus);
  const storageKey = `aviso-pedido:${orderId}`;

  // Permiso de avisos del navegador y si ya los activó para este pedido
  // (en el servidor no existen: se pinta "off" y se corrige al hidratar).
  const noSubscribe = () => () => {};
  const permission = useSyncExternalStore(noSubscribe, () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission), () => "default");
  const stored = useSyncExternalStore(
    noSubscribe,
    () => {
      try {
        return localStorage.getItem(storageKey) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );
  const [enabled, setEnabled] = useState(false);
  const notify = permission === "unsupported" ? "unsupported" : permission === "denied" ? "denied" : permission === "granted" && (enabled || stored) ? "on" : "off";

  // Consulta el estado cada 10 s hasta que el pedido termina.
  useEffect(() => {
    if (FINAL_STATUSES.includes(status)) return;
    const timer = setInterval(async () => {
      if (document.visibilityState === "hidden" && notify !== "on") return;
      try {
        const res = await fetch(`/api/track/${orderId}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        setGoogleUrl(d.googleReviewUrl ?? null);
        if (d.review) setReview(d.review);
        if (d.status !== last.current) {
          last.current = d.status;
          setStatus(d.status);
          const msg = statusNotice(channel, d.status);
          if (msg && notify === "on") {
            try {
              new Notification(msg, { body: "Toca para ver tu pedido", tag: orderId });
            } catch {}
            navigator.vibrate?.([200, 100, 200]);
          }
        }
      } catch {}
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [orderId, channel, status, notify]);

  async function enableNotify() {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      try {
        localStorage.setItem(storageKey, "1");
      } catch {}
    }
    setEnabled(perm === "granted");
  }

  if (status === "CANCELLED") {
    return (
      <div className="mb-4 rounded-[18px] bg-[var(--surface-1)] p-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <p className="text-[15px] font-bold text-[var(--brand-secondary)]">Tu pedido se ha cancelado</p>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Si tienes cualquier duda, llama al restaurante.</p>
      </div>
    );
  }

  const steps = trackingSteps(channel, status);
  const eta = estimatedReadyAt ? new Date(estimatedReadyAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : null;
  const delivered = status === "DELIVERED";

  return (
    <div className="mb-4 space-y-4">
      <div className="rounded-[18px] bg-[var(--surface-1)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">Estado del pedido</p>
          {!delivered && eta && (
            <p className="text-[13px] text-[var(--text-secondary)]">
              {channel === "DELIVERY" ? "Llega hacia las " : "Listo hacia las "}
              <span className="font-bold text-[var(--text-primary)]">{eta}</span>
            </p>
          )}
        </div>
        {/* Línea de pasos */}
        <ol className="mt-4 grid grid-cols-4 gap-1" aria-label="Progreso del pedido">
          {steps.map((s) => (
            <li key={s.key} className="min-w-0" aria-current={s.state === "current" ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full ${s.state === "todo" ? "bg-[var(--border)]" : "bg-[var(--brand-accent)]"} ${s.state === "current" ? "animate-pulse" : ""}`} />
              <span className={`mt-2 block text-[11px] leading-tight ${s.state === "todo" ? "text-[var(--text-secondary)]" : "font-semibold text-[var(--text-primary)]"}`}>{s.label}</span>
            </li>
          ))}
        </ol>
        {!delivered && (
          <div className="mt-4 border-t border-[var(--border)] pt-3 text-[13px]">
            {notify === "on" ? (
              <p className="text-[var(--text-secondary)]">🔔 Te avisaremos aquí cuando cambie el estado. Deja esta página abierta.</p>
            ) : notify === "denied" ? (
              <p className="text-[var(--text-secondary)]">Has bloqueado los avisos. Esta página se actualiza sola.</p>
            ) : notify === "unsupported" ? (
              <p className="text-[var(--text-secondary)]">Esta página se actualiza sola.</p>
            ) : (
              <button onClick={enableNotify} className="p-press rounded-full border border-[var(--brand-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--brand-accent)]">
                🔔 Avisarme cuando esté {channel === "DELIVERY" ? "de camino" : "listo"}
              </button>
            )}
          </div>
        )}
      </div>
      {delivered && <ReviewBox orderId={orderId} review={review} onDone={setReview} googleUrl={googleUrl} />}
    </div>
  );
}

function ReviewBox({ orderId, review, onDone, googleUrl }: { orderId: string; review: Review; onDone: (r: Review) => void; googleUrl: string | null }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!rating) return setError("Elige de 1 a 5 estrellas");
    setSending(true);
    setError("");
    try {
      const res = await fetch(`/api/track/${orderId}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, comment }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo enviar");
      onDone(json.review);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setSending(false);
    }
  }

  if (review) {
    return (
      <div className="rounded-[18px] bg-[var(--surface-1)] p-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <p className="text-[15px] font-bold">¡Gracias por tu valoración!</p>
        <p className="mt-1 text-xl tracking-widest text-[var(--brand-accent)]" aria-label={`${review.rating} de 5 estrellas`}>
          {"★".repeat(review.rating)}
          <span className="text-[var(--border)]">{"★".repeat(5 - review.rating)}</span>
        </p>
        {review.rating >= GOOGLE_REVIEW_MIN && googleUrl && (
          <>
            <p className="mt-3 text-[13px] text-[var(--text-secondary)]">¿Nos ayudas contándolo también en Google? Son 20 segundos.</p>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="p-press mt-3 inline-block rounded-full bg-[var(--brand-accent)] px-5 py-2.5 text-[14px] font-semibold text-[var(--on-accent)] no-underline">
              ★ Dejar reseña en Google
            </a>
          </>
        )}
        {review.rating < GOOGLE_REVIEW_MIN && <p className="mt-2 text-[13px] text-[var(--text-secondary)]">Sentimos que no haya sido perfecto. El restaurante leerá tu comentario.</p>}
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-[var(--surface-1)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <p className="text-center text-[15px] font-bold">¿Qué tal tu pedido?</p>
      <div className="mt-3 flex justify-center gap-1" role="radiogroup" aria-label="Valoración">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
            onClick={() => setRating(n)}
            className={`p-press h-11 w-11 text-3xl leading-none ${n <= rating ? "text-[var(--brand-accent)]" : "text-[var(--border)]"}`}
          >
            ★
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={600}
            rows={3}
            placeholder={rating >= GOOGLE_REVIEW_MIN ? "¿Qué es lo que más te ha gustado? (opcional)" : "¿Qué podemos mejorar? (opcional)"}
            className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none"
          />
          <button onClick={send} disabled={sending} className="p-press mt-3 w-full rounded-full bg-[var(--brand-accent)] py-3 text-[15px] font-semibold text-[var(--on-accent)] disabled:opacity-50">
            {sending ? "Enviando…" : "Enviar valoración"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-center text-[13px] text-[var(--brand-secondary)]">{error}</p>}
    </div>
  );
}
