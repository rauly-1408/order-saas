import { NextRequest, NextResponse } from "next/server";
import type { CancelReason } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { customerProven } from "@/app/lib/customerProof";
import { cancelOrder, CUSTOMER_CANCELS_PER_DAY, customerCanCancel } from "@/app/lib/cancelOrder";
import { rateLimit } from "@/app/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS: CancelReason[] = ["MISTAKE", "ADDRESS_TIME", "CHANGED_MIND"];

// POST /api/track/[orderId]/cancel → el cliente cancela su pedido desde la
// página de seguimiento. Solo mientras el restaurante no lo haya aceptado (o,
// si es programado, hasta una hora antes), solo desde el dispositivo que hizo
// el pedido (cookie de prueba) y como mucho 2 veces al día por teléfono.
// Ver docs/SEGUIMIENTO-Y-RESENAS.md
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const limited = await rateLimit(req, "cancel", 10, 60);
  if (limited) return limited;
  const { orderId } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  const reason = REASONS.find((r) => r === body.reason) ?? null;
  if (!reason) return NextResponse.json({ error: "Elige un motivo" }, { status: 400 });

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, tenantId: true, customerPhone: true, status: true, scheduledFor: true } });
  if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  if (!customerProven(req, order.tenantId, order.customerPhone)) return NextResponse.json({ error: "Solo puedes cancelar desde el dispositivo con el que pediste. Llama al restaurante." }, { status: 403 });
  if (order.status === "CANCELLED") return NextResponse.json({ ok: true, status: "CANCELLED" });
  if (!customerCanCancel(order)) return NextResponse.json({ error: "El restaurante ya ha empezado con tu pedido. Llámalo si necesitas cambiar algo.", code: "TOO_LATE" }, { status: 409 });

  const since = new Date(Date.now() - 24 * 3_600_000);
  const today = await prisma.order.count({ where: { tenantId: order.tenantId, customerPhone: order.customerPhone, cancelledBy: "CUSTOMER", updatedAt: { gte: since } } });
  if (today >= CUSTOMER_CANCELS_PER_DAY) return NextResponse.json({ error: "Ya has cancelado varios pedidos hoy. Para cancelar este, llama al restaurante." }, { status: 429 });

  try {
    const r = await cancelOrder(order.id, "CUSTOMER", reason);
    return NextResponse.json({ ok: true, status: r.order.status, refundError: r.refundError }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Carrera con el panel: lo acaban de aceptar.
    if (err instanceof Error && err.message.startsWith("Transicion invalida")) return NextResponse.json({ error: "El restaurante acaba de aceptar tu pedido. Llámalo si necesitas cambiar algo.", code: "TOO_LATE" }, { status: 409 });
    console.error("[POST /api/track/cancel]", err);
    return NextResponse.json({ error: "No se ha podido cancelar. Llama al restaurante." }, { status: 500 });
  }
}
