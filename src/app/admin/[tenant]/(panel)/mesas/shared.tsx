"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { STORE_VARS } from "../storeVars";

// Piezas comunes de Mesas. Ver docs/MESAS.md

export type Shape = "SQUARE" | "ROUND";
// orderId null: abierta sin conexión, aún sin cuenta en el servidor. pending: tiene algo sin enviar.
export type TableOpen = { orderId: string | null; orderNumber: number | null; label?: string | null; guests: number | null; totalCents: number; openedAt: string; billRequested: boolean; waiter: string | null; lines: number; rounds: number; lastRoundAt: string | null; pending?: boolean; joinedTo?: string | null; joined?: string[] }; // joinedTo: esta mesa va junta en la cuenta de esa otra; joined: las que lleva juntas
// reservation: la próxima reserva de hoy con esa mesa asignada (Reservas). Ver docs/RESERVAS.md
export type TableBooking = { id: string; at: string; name: string; guests: number; pending: boolean };
export type Table = { id: string; name: string; zone: string; seats: number; shape: Shape; posX: number | null; posY: number | null; open: TableOpen | null; reservation?: TableBooking | null };
export type TableCombo = { id: string; tables: string[]; min: number; max: number; priority: number };
export type Fixture = { id: string; kind: "BAR" | "WALL" | "LABEL"; x: number; y: number; w: number; h: number; label: string };
export type MapData = { stores: { id: string; name: string }[]; storeId: string | null; canManage: boolean; canCharge?: boolean; sees: boolean; tables: Table[]; fixtures: Record<string, Fixture[]>; zones?: string[]; combos?: TableCombo[] };

export type CuentaLine = { id: string; name: string; quantity: number; totalCents: number; discountCents: number; modifiers: string[]; note: string | null; ready?: boolean }; // ready: la cocina o la barra lo marcó listo
export type Round = { round: number; at: string; by: string | null; lines: CuentaLine[] };
export type Cuenta = {
  order: { id: string; orderNumber: number | null; status: string; table: { id: string; name: string; zone: string }; joined?: { id: string; name: string; zone: string }[]; label?: string | null; guests: number | null; openedAt: string; billRequestedAt: string | null; totalCents: number; subtotalCents: number; collaboratorDiscountCents: number; collaborator: { name: string; code: string; discountPct: number } | null; waiter: string | null; invoiceNumber: string | null };
  rounds: Round[];
  parts: { id: string; orderNumber: number | null; totalCents: number; paymentMethod: string; paidAt: string | null }[];
  freeTables: { id: string; name: string; zone: string }[];
  busyTables?: { id: string; name: string; zone: string; label: string | null; totalCents: number }[]; // para juntar mesas
  canVoid: boolean;
  canCharge?: boolean; // el puesto puede cobrar (camarero sin permiso: no)
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
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pb-4">{children}</div>
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

// Nombre de la mesa durante el servicio: sale en el plano, en la comanda y en el
// ticket, y se quita solo al cerrar la cuenta.
export const NAME_IDEAS = ["Cumpleaños", "Reserva", "Empresa", "Despedida", "Familia"];
export function NameSheet({ table, current, busy, onClose, onSave }: { table: string; current: string; busy: boolean; onClose: () => void; onSave: (label: string) => Promise<unknown> }) {
  const [label, setLabel] = useState(current);
  const clean = label.replace(/\s+/g, " ").trim().slice(0, 30);
  return (
    <Sheet
      title={`Nombre de la mesa ${table}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {current && (
            <button type="button" disabled={busy} onClick={() => onSave("")} className="p-press min-h-12 rounded-2xl px-4 font-semibold text-[var(--p-accent)]">
              Quitar
            </button>
          )}
          <button type="button" disabled={busy || !clean || clean === current} onClick={() => onSave(clean)} className="p-press min-h-12 flex-1 rounded-2xl bg-[var(--p-ink)] font-semibold text-white disabled:opacity-40">
            Guardar
          </button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-[var(--p-muted)]">Sale en el plano, en la comanda y en el ticket. Al cerrar la cuenta, la mesa vuelve a llamarse {table}.</p>
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={30} autoFocus placeholder="Cumpleaños de Lucía" aria-label="Nombre de la mesa" className="w-full rounded-xl border border-[var(--p-line)] px-4 py-3 text-base" />
      <div className="mt-3 flex flex-wrap gap-2">
        {NAME_IDEAS.map((n) => (
          <button key={n} type="button" onClick={() => setLabel(n)} className="p-press rounded-full border border-[var(--p-line)] px-4 text-sm font-medium">
            {n}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

