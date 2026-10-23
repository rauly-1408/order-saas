"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { courierCustomerLabel } from "@/app/lib/couriers/labels";
import { ui, type Lang } from "@/app/lib/i18n";
import { FINAL_STATUSES, GOOGLE_REVIEW_MIN, statusNotice, trackingSteps, type TrackChannel } from "@/app/lib/tracking";
import CancelOrder from "./CancelOrder";

// Seguimiento en vivo del pedido (se actualiza solo), aviso en el móvil cuando
// cambia de estado y valoración al entregarlo. Usa las CSS vars del theme.

type Review = { rating: number; comment: string | null } | null;
type Courier = { status: string; dropoffEta: string | null; trackingUrl: string | null } | null;
type CancelledBy = "RESTAURANT" | "CUSTOMER" | "SYSTEM" | null;
type Props = {
  lang?: Lang;
  orderId: string;
  channel: TrackChannel;
  initialStatus: string;
  estimatedReadyAt: string | null;
  initialReview: Review;
  googleReviewUrl: string | null;
  initialCourier?: Courier;
  scheduledFor?: string | null;
  cancelledBy?: CancelledBy;
  paidOnline?: boolean;
  restaurantPhone?: string | null;
};

const POLL_MS = 10_000;

export default function OrderTracker({ lang = "es", orderId, channel, initialStatus, estimatedReadyAt, initialReview, googleReviewUrl: initialGoogle, initialCourier = null, scheduledFor = null, cancelledBy: initialCancelledBy = null, paidOnline = false, restaurantPhone = null }: Props) {
  const [status, setStatus] = useState(initialStatus);
  // Cancelar: lo dice el servidor (cookie de prueba + estado); se sabe tras la primera consulta.
  const [canCancel, setCanCancel] = useState(false);
  const [cancelledBy, setCancelledBy] = useState<CancelledBy>(initialCancelledBy);
  const [tooLate, setTooLate] = useState("");
  const [courier, setCourier] = useState<Courier>(initialCourier);
  const [review, setReview] = useState<Review>(initialReview);
  const [googleUrl, setGoogleUrl] = useState(initialGoogle);
  const T = ui(lang);
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

  // Consulta el estado cada 10 s hasta que el pedido termina (y una vez al
  // abrir, para saber si se puede cancelar).
  useEffect(() => {
    if (FINAL_STATUSES.includes(status)) return;
    const tick = async (force = false) => {
      if (!force && document.visibilityState === "hidden" && notify !== "on") return;
      try {
        const res = await fetch(`/api/track/${orderId}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = await res.json();
        setGoogleUrl(d.googleReviewUrl ?? null);
        setCourier(d.courier ?? null);
        setCanCancel(!!d.canCancel);
        if (d.cancelledBy !== undefined) setCancelledBy(d.cancelledBy ?? null);
        if (d.review) setReview(d.review);
        if (d.status !== last.current) {
          last.current = d.status;
          setStatus(d.status);
          const msg = statusNotice(channel, d.status, lang);
          if (msg && notify === "on") {
            try {
              new Notification(msg, { body: lang === "en" ? "Tap to see your order" : "Toca para ver tu pedido", tag: orderId });
            } catch {}
            navigator.vibrate?.([200, 100, 200]);
          }
        }
      } catch {}
    };
    const first = setTimeout(() => tick(true), 0);
    const timer = setInterval(tick, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [orderId, channel, status, notify, lang]);

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

  const phoneHref = restaurantPhone ? `tel:${restaurantPhone.replace(/[\s-]/g, "")}` : null;

  if (status === "CANCELLED") {
    const byCustomer = cancelledBy === "CUSTOMER";
    return (
      <div className="mb-4 rounded-[18px] bg-[var(--surface-1)] p-5 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]" role="status">
        <p className="text-[15px] font-bold text-[var(--brand-secondary)]">{byCustomer ? T.cancelledByYou : T.cancelled}</p>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">{paidOnline ? T.cancelledRefund : T.cancelledHelp}</p>
      </div>
    );
  }

  const steps = trackingSteps(channel, status, lang);
  // Con repartidor externo manda su hora de llegada.
  const etaIso = (channel === "DELIVERY" && courier?.dropoffEta) || estimatedReadyAt;
  const eta = etaIso ? new Date(etaIso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : null;
  const courierText = courier ? courierCustomerLabel(courier.status, lang) : null;
  // Pedido programado para otro día: se dice cuál («mañana», «sábado 18»).
  const etaDay = (() => {
    if (!etaIso) return "";
    const at = new Date(etaIso);
    const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return "";
    if (days === 1) return lang === "en" ? "tomorrow" : "mañana";
    return at.toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", { weekday: "long", day: "numeric" });
  })();
  const delivered = status === "DELIVERED";

  return (
    <div className="mb-4 space-y-4">
      <div className="rounded-[18px] bg-[var(--surface-1)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-medium text-[var(--text-secondary)]">{T.orderStatus}</p>
          {!delivered && eta && (
            <p className="text-[13px] text-[var(--text-secondary)]">
              {channel === "DELIVERY" ? T.arrivesAt : T.readyAt}
              <span className="font-bold text-[var(--text-primary)]">
                {eta}
                {etaDay && ` · ${etaDay}`}
              </span>
            </p>
          )}
        </div>
        {/* Línea de pasos */}
        <ol className="mt-4 grid grid-cols-4 gap-1" aria-label={T.progress}>
          {steps.map((s) => (
            <li key={s.key} className="min-w-0" aria-current={s.state === "current" ? "step" : undefined}>
              <span className={`block h-1.5 rounded-full ${s.state === "todo" ? "bg-[var(--border)]" : "bg-[var(--brand-accent)]"} ${s.state === "current" ? "animate-pulse" : ""}`} />
              <span className={`mt-2 block text-[11px] leading-tight ${s.state === "todo" ? "text-[var(--text-secondary)]" : "font-semibold text-[var(--text-primary)]"}`}>{s.label}</span>
            </li>
          ))}
        </ol>
        {!delivered && courierText && (
          <p className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-0)] px-3 py-2 text-[13px] font-semibold text-[var(--text-primary)]">
            <span>🛵 {courierText}</span>
            {courier?.trackingUrl && (
              <a href={courier.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-accent)] underline">
                {lang === "en" ? "Track on map" : "Seguir en el mapa"}
              </a>
            )}
          </p>
        )}
        {!delivered && (
          <div className="mt-4 border-t border-[var(--border)] pt-3 text-[13px]">
            {notify === "on" ? (
              <p className="text-[var(--text-secondary)]">{T.notifyOn}</p>
            ) : notify === "denied" ? (
              <p className="text-[var(--text-secondary)]">{T.notifyBlocked}</p>
            ) : notify === "unsupported" ? (
              <p className="text-[var(--text-secondary)]">{T.autoUpdates}</p>
            ) : (
              <button onClick={enableNotify} className="p-press rounded-full border border-[var(--brand-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--brand-accent)]">
                {T.notifyMe(channel === "DELIVERY" ? T.onTheWay : T.ready)}
              </button>
            )}
          </div>
        )}
        {/* Cancelar mientras se pueda; después, el teléfono del restaurante */}
        {!delivered && canCancel && !tooLate && (
          <CancelOrder
            lang={lang}
            orderId={orderId}
            scheduled={!!scheduledFor}
            onCancelled={() => {
              last.current = "CANCELLED";
              setCancelledBy("CUSTOMER");
              setStatus("CANCELLED");
            }}
            onTooLate={(m) => {
              setCanCancel(false);
              setTooLate(m);
            }}
          />
        )}
        {!delivered && !canCancel && (tooLate || phoneHref) && (
          <div className="mt-4 border-t border-[var(--border)] pt-3 text-[13px]">
            <p className="text-[var(--text-secondary)]">{tooLate || T.anyProblem}</p>
            {phoneHref && (
              <a href={phoneHref} className="p-press mt-2 inline-block rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] no-underline">
                📞 {T.callRestaurant}
              </a>
            )}
          </div>
        )}
      </div>
      {delivered && <ReviewBox lang={lang} orderId={orderId} review={review} onDone={setReview} googleUrl={googleUrl} />}
    </div>
  );
}

function ReviewBox({ lang, orderId, review, onDone, googleUrl }: { lang: Lang; orderId: string; review: Review; onDone: (r: Review) => void; googleUrl: string | null }) {
  const T = ui(lang);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    if (!rating) return setError(T.pickStars);
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
        <p className="text-[15px] font-bold">{T.thanksReview}</p>
        <p className="mt-1 text-xl tracking-widest text-[var(--brand-accent)]" aria-label={T.stars(review.rating)}>
          {"★".repeat(review.rating)}
          <span className="text-[var(--border)]">{"★".repeat(5 - review.rating)}</span>
        </p>
        {review.rating >= GOOGLE_REVIEW_MIN && googleUrl && (
          <>
            <p className="mt-3 text-[13px] text-[var(--text-secondary)]">{T.googleAsk}</p>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="p-press mt-3 inline-block rounded-full bg-[var(--brand-accent)] px-5 py-2.5 text-[14px] font-semibold text-[var(--on-accent)] no-underline">
              {T.googleBtn}
            </a>
          </>
        )}
        {review.rating < GOOGLE_REVIEW_MIN && <p className="mt-2 text-[13px] text-[var(--text-secondary)]">{T.sorry}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-[18px] bg-[var(--surface-1)] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <p className="text-center text-[15px] font-bold">{T.howWasIt}</p>
      <div className="mt-3 flex justify-center gap-1" role="radiogroup" aria-label={T.howWasIt}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={rating === n}
            aria-label={T.stars(n)}
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
            placeholder={rating >= GOOGLE_REVIEW_MIN ? T.likedMost : T.improve}
            className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-[14px] text-[var(--text-primary)] outline-none"
          />
          <button onClick={send} disabled={sending} className="p-press mt-3 w-full rounded-full bg-[var(--brand-accent)] py-3 text-[15px] font-semibold text-[var(--on-accent)] disabled:opacity-50">
            {sending ? T.sendingReview : T.sendReview}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-center text-[13px] text-[var(--brand-secondary)]">{error}</p>}
    </div>
  );
}
