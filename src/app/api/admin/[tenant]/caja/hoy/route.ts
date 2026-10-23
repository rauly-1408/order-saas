import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { getSessionFromRequest } from "@/app/lib/auth";
import { startOfTodayIn, tenantTimeZone } from "@/app/lib/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/caja/hoy → las ventas de hoy (hora del restaurante)
// para el resumen «Hoy en caja»: totales por forma de pago y lista de pedidos.
// Cuenta todo lo que llegó a cocina (online y Caja); fuera quedan los pagos
// online sin confirmar. Ver docs/CAJA.md

export type HoyPayment = "CASH" | "CARD_TERMINAL" | "BIZUM" | "CARD" | "IN_STORE";
export type HoyOrder = {
  id: string;
  orderNumber: number | null;
  customerName: string;
  source: "ONLINE" | "COUNTER" | "PHONE";
  channel: "TAKEAWAY" | "DELIVERY";
  dineIn: boolean;
  paymentMethod: HoyPayment;
  paid: boolean;
  status: string;
  totalCents: number;
  createdAt: string;
};
export type HoyResponse = {
  day: string;
  sales: number;
  totalCents: number;
  byPayment: Record<HoyPayment, number>;
  pendingCents: number; // pedidos activos sin cobrar (pagar al recoger / al entregar)
  cancelled: number;
  refundedCents: number;
  orders: HoyOrder[];
};

export async function GET(req: NextRequest) {
  try {
    const slug = new URL(req.url).pathname.split("/").at(-3) ?? "";
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });

    const tz = tenantTimeZone(tenant.settings);
    const dayStart = startOfTodayIn(tz, new Date());
    const rows = await prisma.order.findMany({
      where: { tenantId: tenant.id, createdAt: { gte: dayStart }, status: { not: "AWAITING_PAYMENT" }, ...(session.storeId ? { storeId: session.storeId } : {}) },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, customerName: true, source: true, channel: true, dineIn: true, paymentMethod: true, paymentStatus: true, status: true, totalCents: true, createdAt: true },
    });

    const byPayment: Record<HoyPayment, number> = { CASH: 0, CARD_TERMINAL: 0, BIZUM: 0, CARD: 0, IN_STORE: 0 };
    let sales = 0;
    let totalCents = 0;
    let pendingCents = 0;
    let cancelled = 0;
    let refundedCents = 0;
    for (const o of rows) {
      if (o.status === "CANCELLED") {
        cancelled++;
        if (o.paymentStatus === "REFUNDED") refundedCents += o.totalCents;
        continue;
      }
      sales++;
      totalCents += o.totalCents;
      if (o.paymentStatus === "PAID") byPayment[o.paymentMethod] += o.totalCents;
      else pendingCents += o.totalCents;
    }
    const day = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(dayStart);
    const body: HoyResponse = {
      day,
      sales,
      totalCents,
      byPayment,
      pendingCents,
      cancelled,
      refundedCents,
      orders: rows.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        source: o.source,
        channel: o.channel === "DELIVERY" ? "DELIVERY" : "TAKEAWAY",
        dineIn: o.dineIn,
        paymentMethod: o.paymentMethod,
        paid: o.paymentStatus === "PAID",
        status: o.status,
        totalCents: o.totalCents,
        createdAt: o.createdAt.toISOString(),
      })),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[GET /api/admin/caja/hoy]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
