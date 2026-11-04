"use client";

import { useEffect, useRef } from "react";
import { ui, type Lang } from "@/app/lib/i18n";
import type { PartnerLink } from "./DeliveryPartners";

// «¿Con quién quieres tu pedido?»: al elegir «A domicilio», como en la app de
// Burger King. Si el restaurante reparte, su opción va primero (pides y pagas
// aquí); después, su tienda en Glovo, Uber Eats o Just Eat, que se abre en su
// app. Usa las CSS vars del theme del tenant. Ver docs/REPARTO-PLATAFORMAS.md

const BADGE: Record<string, { bg: string; fg: string }> = {
  glovo: { bg: "#ffc244", fg: "#1d1d1f" },
  ubereats: { bg: "#06c167", fg: "#0b1f12" },
  justeat: { bg: "#ff8000", fg: "#ffffff" },
};

type Props = {
  partners: PartnerLink[];
  ownName?: string | null; // nombre del restaurante si hace reparto propio
  onOwn?: () => void;
  onClose: () => void;
  lang?: Lang;
};

export default function DeliveryChooser({ partners, ownName, onOwn, onClose, lang = "es" }: Props) {
  const T = ui(lang);
  const first = useRef<HTMLElement | null>(null);

  // Bloquea el scroll de fondo, cierra con Escape y pone el foco en la primera opción.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    first.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const tile = "p-press flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3.5 text-left text-[var(--text-primary)] no-underline";
  const badge = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold";

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="delivery-who">
      <button type="button" aria-label={T.close} onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div className="p-rise relative w-full max-w-md rounded-t-[28px] bg-[var(--surface-0)] p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--text-primary)] shadow-2xl sm:rounded-[28px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="delivery-who" className="text-[20px] font-bold leading-tight">🛵 {T.deliveryWho}</h2>
            <p className="mt-1 text-[14px] text-[var(--text-secondary)]">{T.deliveryWhoText}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={T.close} className="p-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-[18px]">
            ×
          </button>
        </div>

        <div className="mt-4 grid gap-2.5">
          {ownName && onOwn && (
            <button type="button" ref={(el) => { first.current = el; }} onClick={onOwn} className={tile} style={{ borderColor: "var(--brand-accent)" }}>
              <span className={badge} style={{ backgroundColor: "var(--brand-accent)", color: "var(--on-accent)" }} aria-hidden>
                🛵
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">{T.ownDelivery(ownName)}</span>
                <span className="block text-[13px] text-[var(--text-secondary)]">{T.ownDeliveryHint}</span>
              </span>
              <span aria-hidden className="text-[var(--text-secondary)]">›</span>
            </button>
          )}
          {partners.map((p, i) => (
            <a
              key={p.key}
              ref={(el) => { if (i === 0 && !(ownName && onOwn)) first.current = el; }}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className={tile}
            >
              <span className={badge} style={{ backgroundColor: BADGE[p.key]?.bg ?? "var(--surface-1)", color: BADGE[p.key]?.fg ?? "inherit" }} aria-hidden>
                {p.label.split(" ").map((w) => w[0]).join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">{p.label}</span>
                <span className="block text-[13px] text-[var(--text-secondary)]">{T.partnerHint}</span>
              </span>
              <span aria-hidden className="text-[var(--text-secondary)]">↗</span>
            </a>
          ))}
        </div>
        {partners.length > 0 && <p className="mt-4 text-[12px] leading-snug text-[var(--text-secondary)]">{T.partnerNote}</p>}
      </div>
    </div>
  );
}
