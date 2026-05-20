import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED:   ["ACCEPTED", "CANCELLED"],
  ACCEPTED:  ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY:     ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    const { status: newStatus } = await req.json();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });

    const allowed = VALID_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Transicion invalida: ${order.status} -> ${newStatus}` },
        { status: 400 }
      );
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus },
    });

    return NextResponse.json({ orderId: updated.id, status: updated.status });
  } catch (err) {
    console.error("[PATCH /api/orders/status]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
