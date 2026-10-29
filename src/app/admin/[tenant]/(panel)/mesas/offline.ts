"use client";

import { pendingList, type Pending } from "../outbox";
import type { CuentaLine, Table } from "./shared";

// Mesas sin conexión: lo que hay en la cola del aparato (mesas abiertas,
// rondas, cobros, cambios de mesa y cuentas pedidas) se pinta encima del último
// plano y de la última cuenta guardados, para seguir trabajando como si nada.
// Al volver internet la cola se envía en orden y el servidor manda.
// Ver docs/SIN-CONEXION.md

// Lo que cada envío lleva para poder enseñarlo antes de llegar al servidor
// (el servidor no lo usa: recalcula siempre los importes).
export type PreviewLine = { name: string; quantity: number; totalCents: number; modifiers: string[]; note: string | null };
export type Preview = { lines?: PreviewLine[]; totalCents?: number };

export type PendingRound = { at: number; lines: PreviewLine[] };
export type TableOverlay = {
  rounds: PendingRound[]; // rondas aún sin enviar
  paidCents: number; // cobrado por partes sin enviar
  paidAll: boolean; // cobrada entera sin enviar: la mesa queda libre
  billed: boolean;
};

export const planKey = (tenant: string, storeId: string | null) => `mesas:${tenant}:${storeId ?? "-"}`;
export const cuentaKey = (orderId: string) => `cuenta:${orderId}`;

const empty = (): TableOverlay => ({ rounds: [], paidCents: 0, paidAll: false, billed: false });
const sum = (lines: PreviewLine[] = []) => lines.reduce((a, l) => a + l.totalCents, 0);
const count = (lines: PreviewLine[] = []) => lines.reduce((a, l) => a + l.quantity, 0);

// Aplica la cola al plano: devuelve las mesas tal como estarán al enviarse y,
// por mesa, lo que falta por enviar.
export function applyQueue(tenant: string, tables: Table[], queue: Pending[] = pendingList()): { tables: Table[]; overlay: Map<string, TableOverlay> } {
  const base = `/api/admin/${tenant}/mesas`;
  const byId = new Map(tables.map((t) => [t.id, { ...t, open: t.open ? { ...t.open } : null }]));
  const overlay = new Map<string, TableOverlay>();
  const ov = (id: string) => overlay.get(id) ?? (overlay.set(id, empty()), overlay.get(id)!);
  const tableOfOrder = (orderId: string) => [...byId.values()].find((t) => t.open?.orderId === orderId)?.id;

  const addRound = (id: string, at: number, preview?: Preview) => {
    const t = byId.get(id);
    if (!t?.open) return;
    const lines = preview?.lines ?? [];
    t.open.totalCents += sum(lines);
    t.open.lines += count(lines);
    t.open.rounds += 1;
    t.open.lastRoundAt = new Date(at).toISOString();
    t.open.pending = true;
    ov(id).rounds.push({ at, lines });
  };

  for (const p of queue) {
    if (p.error || !p.url.startsWith(base)) continue;
    const b = p.body as Record<string, unknown> & { preview?: Preview };
    const orderId = p.url.length > base.length ? p.url.slice(base.length + 1) : null;
    let tableId: string | undefined;
    let op = b.action as string;
    if (orderId) tableId = tableOfOrder(orderId);
    else if (op === "open" || op === "table") tableId = typeof b.tableId === "string" ? b.tableId : undefined;
    if (op === "table") op = String(b.op);
    const t = tableId ? byId.get(tableId) : undefined;
    if (!t) continue;

    if (op === "open") {
      // Abrir sin conexión (si ya estaba abierta, la ronda se suma a esa cuenta).
      if (!t.open) {
        t.open = { orderId: null, orderNumber: null, guests: Number(b.guests) || 1, totalCents: 0, openedAt: new Date(p.at).toISOString(), billRequested: false, waiter: null, lines: 0, rounds: 0, lastRoundAt: null, pending: true };
      }
      if (b.round) addRound(t.id, p.at, b.preview);
    } else if (op === "round") {
      addRound(t.id, p.at, b.preview);
    } else if (op === "bill" && t.open) {
      t.open.billRequested = true;
      t.open.pending = true;
      ov(t.id).billed = true;
    } else if (op === "pay" && t.open) {
      if (Array.isArray(b.units) && b.units.length) {
        const paid = b.preview?.totalCents ?? 0;
        t.open.totalCents = Math.max(0, t.open.totalCents - paid);
        t.open.pending = true;
        ov(t.id).paidCents += paid;
      } else {
        t.open = null; // cobrada entera: la mesa queda libre
        ov(t.id).paidAll = true;
      }
    } else if (op === "move" && t.open) {
      const to = byId.get(String(orderId ? b.tableId : b.toTableId));
      if (!to || to.open) continue;
      to.open = { ...t.open, pending: true };
      t.open = null;
      overlay.set(to.id, overlay.get(t.id) ?? empty());
      overlay.delete(t.id);
    }
  }
  return { tables: tables.map((t) => byId.get(t.id)!), overlay };
}

// Las rondas sin enviar, como líneas de la cuenta (no se pueden cobrar por
// separado hasta que tengan su número en el servidor).
export function pendingRoundsAsCuenta(rounds: PendingRound[]) {
  return rounds.map((r, i) => ({
    round: -(i + 1),
    at: new Date(r.at).toISOString(),
    by: null,
    lines: r.lines.map((l, j): CuentaLine => ({ id: `pendiente-${i}-${j}`, name: l.name, quantity: l.quantity, totalCents: l.totalCents, discountCents: 0, modifiers: l.modifiers, note: l.note })),
  }));
}
export const isPendingLine = (id: string) => id.startsWith("pendiente-");

// ¿Es un fallo de red (sin conexión) y no un error del servidor?
export const isOffline = (e: unknown) => e instanceof TypeError || (typeof navigator !== "undefined" && navigator.onLine === false);
