import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { usableGiftCard } from "@/app/lib/giftCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/giftcards/[tenant]?code=… → saldo de una tarjeta regalo (checkout).
// Solo dice el saldo; el canje real se hace al crear el pedido.
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Restaurante no encontrado" }, { status: 404 });
  const found = await usableGiftCard(tenant.id, code);
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: 400 });
  return NextResponse.json({ code: found.card.code, balanceCents: found.card.balanceCents });
}
