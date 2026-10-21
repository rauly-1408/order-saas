import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/app/lib/rateLimit";
import { prisma } from "@/app/lib/prisma";
import { parseReview } from "@/app/lib/tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/track/[orderId]/review { rating, comment } → valoración del pedido.
// Solo cuando ya está entregado, y una sola vez por pedido.
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const limited = await rateLimit(req, "review", 5, 60);
  if (limited) return limited;
  const { orderId } = await params;
  const input = parseReview(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { tenantId: true, status: true, review: { select: { id: true } } } });
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (order.status !== "DELIVERED") return NextResponse.json({ error: "Podrás valorarlo cuando lo hayas recibido" }, { status: 409 });
  if (order.review) return NextResponse.json({ error: "Ya has valorado este pedido. ¡Gracias!" }, { status: 409 });
  try {
    const review = await prisma.review.create({ data: { tenantId: order.tenantId, orderId, ...input }, select: { rating: true, comment: true } });
    return NextResponse.json({ review }, { status: 201 });
  } catch {
    // Dos envíos a la vez: el índice único deja pasar solo uno.
    return NextResponse.json({ error: "Ya has valorado este pedido. ¡Gracias!" }, { status: 409 });
  }
}
