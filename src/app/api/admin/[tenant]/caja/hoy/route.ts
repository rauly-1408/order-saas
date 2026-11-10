import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";
import { addDays, localParts, startOfDayIn, tenantTimeZone } from "@/app/lib/time";
import { accessOf } from "@/app/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/caja/hoy[?fecha=YYYY-MM-DD] → las ventas de hoy (u otro día; hora del restaurante)
// GET …/caja/hoy?buscar=texto → los pedidos de los últimos 6 meses por nombre,
// teléfono o número de pedido (un cliente reclama: «¿qué le vendí?»)
// para el resumen «Hoy en caja»: totales por forma de pago y lista de pedidos.
// Cuenta todo lo que llegó a cocina (online y Caja); fuera quedan los pagos
// online sin confirmar. Ver docs/CAJA.md

export type HoyPayment = "CASH" | "CARD_TERMINAL" | "BIZUM" | "CARD" | "IN_STORE";
export type HoyOrder = {
  id: string;
  orderNumber: number | null;
  customerName: string;
  source: "ONLINE" | "COUNTER" | "PHONE" | "TABLE";
  channel: "TAKEAWAY" | "DELIVERY";
  dineIn: boolean;
  paymentMethod: HoyPayment;
  cashPartCents: number; // pago mixto: lo pagado en efectivo
  paid: boolean;
  status: string;
  totalCents: number;
  createdAt: string;
  customerPhone: string;
};
export type HoyResponse = {
  day: string;
  date: string; // YYYY-MM-DD del día que se ve
  today: string; // YYYY-MM-DD de hoy en el restaurante
  canFix: boolean; // puede anular o corregir un cobro (gerente o encargado)
  canMethod: boolean; // puede cambiar la forma de pago
  search: string | null; // texto buscado (entonces la lista son resultados, no un día)
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
    const noArea = denyUnlessArea(session, "caja");
    if (noArea) return noArea;
    if (!session.seesTakings) return NextResponse.json({ error: "No tienes permiso para ver lo recaudado" }, { status: 403 });

    const tz = tenantTimeZone(tenant.settings);
    const today = localParts(new Date(), tz).ymd;
    const asked = new URL(req.url).searchParams.get("fecha") ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today ? asked : today;
    const dayStart = startOfDayIn(tz, date);
    const dayEnd = startOfDayIn(tz, addDays(date, 1));
    const access = accessOf(session);
    const search = (new URL(req.url).searchParams.get("buscar") ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    const digits = search.replace(/\D/g, "");
    // Sin distinguir mayúsculas ni tildes («garcia» encuentra «García»).
    const fold = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let byText: { id: { in: string[] } } | null = null;
    if (search.length >= 2) {
      const since = new Date(Date.now() - 183 * 86_400_000);
      const like = `%${fold(search).replace(/[%_\\]/g, "")}%`;
      const num = /^#?\d{1,7}$/.test(search) ? Number(digits) : -1;
      const phone = digits.length >= 3 ? `%${digits}%` : null;
      const hits = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Order"
        WHERE "tenantId" = ${tenant.id} AND "createdAt" >= ${since}
          AND (translate(lower("customerName"), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc') LIKE ${like}
               OR (${phone}::text IS NOT NULL AND "customerPhone" LIKE ${phone})
               OR "orderNumber" = ${num})
        ORDER BY "createdAt" DESC LIMIT 60`;
      byText = { id: { in: hits.map((h) => h.id) } };
    }
    const rows = await prisma.order.findMany({
      where: { tenantId: tenant.id, ...(byText ?? { createdAt: { gte: dayStart, lt: dayEnd } }), status: { not: "AWAITING_PAYMENT" }, ...(session.storeId ? { storeId: session.storeId } : {}) },
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, customerName: true, customerPhone: true, source: true, channel: true, dineIn: true, paymentMethod: true, cashPartCents: true, paymentStatus: true, status: true, totalCents: true, createdAt: true },
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
      if (o.paymentStatus === "PAID") {
        // Pago mixto: la parte en efectivo va al efectivo y el resto a su método.
        const cashPart = o.paymentMethod === "CASH" ? 0 : o.cashPartCents;
        byPayment[o.paymentMethod] += o.totalCents - cashPart;
        byPayment.CASH += cashPart;
      }
      else pendingCents += o.totalCents;
    }
    const day = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(dayStart);
    const body: HoyResponse = {
      day,
      date,
      today,
      canFix: access.anular,
      canMethod: access.cobrar,
      search: byText ? search : null,
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
        cashPartCents: o.paymentMethod === "CASH" ? 0 : o.cashPartCents,
        paid: o.paymentStatus === "PAID",
        status: o.status,
        totalCents: o.totalCents,
        createdAt: o.createdAt.toISOString(),
        customerPhone: o.customerPhone,
      })),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[GET /api/admin/caja/hoy]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
