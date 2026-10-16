import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { parseOnline } from "@/app/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/track/[orderId] → estado del pedido para la página de seguimiento.
// Público (el id es largo e imposible de adivinar) y sin datos personales.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      channel: true,
      estimatedReadyAt: true,
      review: { select: { rating: true, comment: true } },
      tenant: { select: { branding: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  const online = parseOnline((order.tenant.branding as Record<string, unknown> | null)?.online);
  return NextResponse.json(
    { status: order.status, channel: order.channel, estimatedReadyAt: order.estimatedReadyAt, review: order.review, googleReviewUrl: online.reviewsUrl },
    { headers: { "Cache-Control": "no-store" } }
  );
}
