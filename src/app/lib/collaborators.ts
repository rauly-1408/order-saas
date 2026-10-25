import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { cleanText } from "./text";

// Colaboradores: traen pedidos con su código (enlace o escrito al pedir) y se
// llevan un % del pedido, que se les paga en efectivo cada mes. Ver docs/COLABORADORES.md

// El código: letras y números, en mayúsculas (LAURA, HOTELALHAMBRA, PUB7…).
export function normalizeCollabCode(raw: unknown): string {
  return typeof raw === "string"
    ? raw
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 20)
    : "";
}
export const validCollabCode = (code: string) => /^[A-Z0-9]{3,20}$/.test(code);

// Lo que se lleva de un pedido: su % de lo pedido (sin envío ni propina, con los descuentos ya restados).
export function commissionCents(baseCents: number, pct: number): number {
  if (!(baseCents > 0) || !(pct > 0)) return 0;
  return Math.round((baseCents * Math.min(pct, 100)) / 100);
}

export const newCollabToken = () => randomBytes(18).toString("base64url");

// Mes AAAA-MM en la hora del restaurante.
export function monthOf(date: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
// Primer instante del mes en esa zona horaria (para filtrar pedidos).
export function monthStart(month: string, timeZone: string): Date {
  const [y, m] = month.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  // Desfase de la zona en ese momento (p. ej. +1 h o +2 h en Madrid).
  const local = new Date(guess.toLocaleString("en-US", { timeZone }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}

// Pedidos que cuentan para el colaborador: ni cancelados ni sin pagar online.
export const COUNTED = { status: { notIn: ["CANCELLED" as const, "AWAITING_PAYMENT" as const] } };

// Busca el colaborador activo de un código (para la tienda y la Caja).
export async function collaboratorByCode(tenantId: string, raw: unknown): Promise<{ id: string; name: string; place: string | null; commissionPct: number } | null> {
  const code = normalizeCollabCode(raw);
  if (!validCollabCode(code)) return null;
  return prisma.collaborator.findFirst({ where: { tenantId, code, active: true }, select: { id: true, name: true, place: true, commissionPct: true } });
}

// Datos de un colaborador que llegan del panel.
export function parseCollaborator(b: Record<string, unknown>) {
  const name = cleanText(b.name, 60);
  if (!name) return "Escribe el nombre";
  const code = normalizeCollabCode(b.code || name);
  if (!validCollabCode(code)) return "El código necesita de 3 a 20 letras o números";
  const pct = Number(b.commissionPct);
  if (!(pct > 0 && pct <= 50)) return "El porcentaje tiene que estar entre 1 y 50";
  return {
    name,
    code,
    commissionPct: Math.round(pct * 10) / 10,
    place: cleanText(b.place, 80) || null,
    phone: cleanText(b.phone, 20) || null,
    notes: cleanText(b.notes, 300) || null,
  };
}
