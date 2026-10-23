"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { STORE_VARS } from "../storeVars";

// Piezas comunes de Mesas. Ver docs/MESAS.md

export type Shape = "SQUARE" | "ROUND";
export type TableOpen = { orderId: string; orderNumber: number | null; guests: number | null; totalCents: number; openedAt: string; billRequested: boolean; waiter: string | null; lines: number };
export type Table = { id: string; name: string; zone: string; seats: number; shape: Shape; posX: number | null; posY: number | null; open: TableOpen | null };
export type MapData = { stores: { id: string; name: string }[]; storeId: string | null; canManage: boolean; tables: Table[] };

export type CuentaLine = { id: string; name: string; quantity: number; totalCents: number; discountCents: number; modifiers: string[]; note: string | null };
export type Round = { round: number; at: string; by: string | null; lines: CuentaLine[] };
export type Cuenta = {
  order: { id: string; orderNumber: number | null; status: string; table: { id: string; name: string; zone: string }; guests: number | null; openedAt: string; billRequestedAt: string | null; totalCents: number; waiter: string | null; invoiceNumber: string | null };
  rounds: Round[];
  parts: { id: string; orderNumber: number | null; totalCents: number; paymentMethod: string; paidAt: string | null }[];
  freeTables: { id: string; name: string; zone: string }[];
  canVoid: boolean;
};

export const euros = (c: number) => (c / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
export const parseEuros = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
export function minutesSince(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ""}`.trim();
}
export const PAY_LABEL: Record<string, string> = { CASH: "Efectivo", CARD_TERMINAL: "Datáfono", BIZUM: "Bizum" };

// POST a la API con el error en español listo para enseñar.
export async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "No se ha podido hacer. Inténtalo de nuevo.");
  return json as T;
}

// Las hojas se pintan en .panel (fuera de .p-page): la animación de entrada de
// la página encierra los elementos «fixed». Igual que en la Caja. Estas piezas
// solo se montan en el navegador (al tocar algo), así que document ya existe.
export function usePortal(): HTMLElement | null {
  const [el] = useState<HTMLElement | null>(() => (typeof document === "undefined" ? null : ((document.querySelector(".panel") as HTMLElement | null) ?? document.body)));
  return el;
}

// Hoja que sube desde abajo en el móvil y se centra en el ordenador.
export function Sheet({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const portal = usePortal();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!portal) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title} style={STORE_VARS}>
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className={`relative flex max-h-[92vh] w-full flex-col rounded-t-[24px] bg-[var(--p-surface)] text-[var(--p-ink)] shadow-xl sm:rounded-[24px] ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full px-3 py-1.5 text-sm text-[var(--p-muted)] hover:bg-black/[0.05]">
            Cerrar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-[var(--p-line)] px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    portal
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-black/[0.05] p-1" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Menos ${label}`} className="p-press h-9 w-9 rounded-full bg-[var(--p-surface)] text-lg font-semibold shadow-sm disabled:opacity-40">
        −
      </button>
      <span className="min-w-8 text-center text-base font-semibold tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Más ${label}`} className="p-press h-9 w-9 rounded-full bg-[var(--p-surface)] text-lg font-semibold shadow-sm disabled:opacity-40">
        +
      </button>
    </div>
  );
}
