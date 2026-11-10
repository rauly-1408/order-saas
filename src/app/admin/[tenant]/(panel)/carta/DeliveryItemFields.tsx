"use client";

import { useState } from "react";
import ImagePicker from "../archivos/ImagePicker";

// Un plato en una carta delivery: si se vende, su precio y, si se quiere, otra
// foto y otra descripción solo para esa carta. Vacío = lo del local. Se usa en
// «¿Dónde se vende?» del producto y en la ficha del plato dentro de una carta.
// Ver docs/REPARTO-PLATAFORMAS.md
export type DeliveryItem = { id: string; name: string; channels: string[]; offered: boolean; priceCents: number | null; description: string; imageUrl: string };

const PLATFORM: Record<string, string> = { glovo: "Glovo", ubereats: "Uber Eats", justeat: "Just Eat" };
const euros = (c: number) => (c / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const parseEurosOrNull = (v: string): number | null | "bad" => {
  const t = v.trim().replace("€", "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? Math.round(n * 100) : "bad";
};

export default function DeliveryItemFields({
  tenant,
  item,
  local,
  onChange,
  showName = true,
}: {
  tenant: string;
  item: DeliveryItem;
  local: { priceCents: number | null; description: string; imageUrl: string };
  onChange: (patch: Partial<DeliveryItem> & { priceText?: string }) => void;
  showName?: boolean;
}) {
  const [priceText, setPriceText] = useState(item.priceCents != null ? euros(item.priceCents) : "");
  const [custom, setCustom] = useState(!!(item.description || item.imageUrl));
  const where = item.channels.length ? item.channels.map((c) => PLATFORM[c] ?? c).join(", ") : "sin plataforma asignada";
  return (
    <div className={`rounded-2xl border-2 transition-colors ${item.offered ? "border-[var(--p-brand)] bg-[var(--p-brand-soft)]/40" : "border-[var(--p-line)]"}`}>
      <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
        <input type="checkbox" checked={item.offered} onChange={(e) => onChange({ offered: e.target.checked })} className="h-5 w-5 shrink-0 accent-[var(--p-brand)]" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{showName ? item.name : "Se vende en esta carta"}</span>
          <span className="block text-xs text-[var(--p-muted)]">{showName ? where : item.offered ? "Aparece en las plataformas de esta carta" : "No aparece en esta carta"}</span>
        </span>
      </label>
      {item.offered && (
        <div className="space-y-3 border-t border-[var(--p-line)] px-4 py-3">
          <label className="block text-sm font-medium">
            Precio en esta carta
            <span className="relative mt-1 block">
              <input
                value={priceText}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d,.]/g, "");
                  setPriceText(v);
                  const c = parseEurosOrNull(v);
                  onChange({ priceText: v, ...(c !== "bad" && { priceCents: c }) });
                }}
                inputMode="decimal"
                placeholder={local.priceCents != null ? euros(local.priceCents) : "Igual que en el local"}
                className="w-full rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2.5 pr-8 text-right text-base tabular-nums outline-none focus:border-[var(--p-brand)]"
              />
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--p-muted)]">€</span>
            </span>
            <span className="mt-1 block text-xs font-normal text-[var(--p-muted)]">Vacío = el mismo precio que en el local.</span>
          </label>
          {!custom ? (
            <button type="button" onClick={() => setCustom(true)} className="p-press inline-flex min-h-11 items-center rounded-full bg-[var(--p-surface)] px-4 text-sm font-semibold text-[var(--p-brand-strong)]">
              + Otra foto o descripción para esta carta
            </button>
          ) : (
            <>
              <div className="text-sm font-medium">
                Foto en esta carta <span className="font-normal text-[var(--p-muted)]">(vacía = la del local)</span>
                <div className="mt-1">
                  <ImagePicker tenant={tenant} value={item.imageUrl} onChange={(url) => onChange({ imageUrl: url })} />
                </div>
              </div>
              <label className="block text-sm font-medium">
                Descripción en esta carta
                <textarea
                  rows={2}
                  value={item.description}
                  onChange={(e) => onChange({ description: e.target.value })}
                  placeholder={local.description || "Vacía = la del local"}
                  maxLength={500}
                  className="mt-1 w-full resize-y rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--p-brand)]"
                />
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
