import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { enqueueOrderPrints } from "@/app/lib/printing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/[tenant]/print/[orderId] { kind: "KITCHEN" | "RECEIPT" }
// → reimprime la comanda o el ticket de un pedido. Cualquier usuario del
// restaurante (también el rol «Pedidos»). Ver docs/IMPRESION.md
export async function POST(req: NextRequest) {
  try {
    const parts = new URL(req.url).pathname.split("/");
    const slug = parts[parts.indexOf("admin") + 1];
    const orderId = parts[parts.length - 1];
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId: tenant.id }, select: { id: true, storeId: true } });
    if (!order) return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    if (session.storeId && session.storeId !== order.storeId) return NextResponse.json({ error: "Este pedido es de otro local" }, { status: 403 });
    const b = (await req.json().catch(() => ({}))) as { kind?: unknown };
    const kind = b.kind === "RECEIPT" ? "RECEIPT" : "KITCHEN";
    const n = await enqueueOrderPrints(order.id, [kind], { reprint: true });
    if (!n) return NextResponse.json({ error: kind === "KITCHEN" ? "No hay ninguna impresora de comandas configurada" : "No hay ninguna impresora de tickets configurada" }, { status: 400 });
    return NextResponse.json({ ok: true, jobs: n });
  } catch (err) {
    console.error("[POST /api/admin/print]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
