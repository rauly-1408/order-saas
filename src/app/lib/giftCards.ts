// Tarjetas regalo: el restaurante las emite en el panel (las vende en el local
// o las regala) y el cliente las canjea en el checkout con su código. El saldo
// se descuenta al hacer el pedido y se devuelve si el pedido se cancela o el
// pago online no se completa. Ver docs/CONFIGURACION.md
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

// Sin letras que se confunden (0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newGiftCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${part()}-${part()}-${part()}`;
}

export const normalizeGiftCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/(.{4})(?=.)/g, "$1-");

// Tarjeta canjeable (activa, con saldo y sin caducar) o el motivo para el cliente.
export async function usableGiftCard(tenantId: string, raw: string, now = new Date()) {
  const code = normalizeGiftCode(raw);
  if (code.length < 4) return { error: "Escribe el código de la tarjeta" } as const;
  const card = await prisma.giftCard.findUnique({ where: { tenantId_code: { tenantId, code } } });
  if (!card || !card.active) return { error: "Esa tarjeta regalo no existe" } as const;
  if (card.expiresAt && card.expiresAt < now) return { error: "Esa tarjeta regalo ha caducado" } as const;
  if (card.balanceCents <= 0) return { error: "Esa tarjeta regalo ya no tiene saldo" } as const;
  return { card } as const;
}

// Devuelve a la tarjeta lo que se gastó en un pedido (cancelado o sin pagar).
export async function restoreGiftCard(tx: Prisma.TransactionClient, order: { giftCardId: string | null; giftCardCents: number }) {
  if (!order.giftCardId || order.giftCardCents <= 0) return;
  await tx.giftCard.update({ where: { id: order.giftCardId }, data: { balanceCents: { increment: order.giftCardCents } } });
}
