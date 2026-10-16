import { NextRequest } from "next/server";
import { toCsv } from "@/app/lib/reports";
import { loadReportOrders, reportContext } from "@/app/lib/reportsApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  CREATED: "Nuevo", ACCEPTED: "Aceptado", PREPARING: "Preparando", READY: "Listo",
  DELIVERING: "En reparto", DELIVERED: "Entregado", CANCELLED: "Cancelado",
};

// GET → CSV de los pedidos del periodo (se abre directamente en Excel).
export async function GET(req: NextRequest) {
  const ctx = await reportContext(req);
  if ("error" in ctx) return ctx.error;
  const { range } = ctx;
  const orders = await loadReportOrders(ctx.tenant.id, range.start, range.end);
  const fmt = new Intl.DateTimeFormat("es-ES", { timeZone: range.timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const eur = (c: number) => Math.round(c) / 100;
  const rows: (string | number | null)[][] = [
    ["Fecha", "Nº", "Cliente", "Teléfono", "Canal", "Estado", "Productos", "Subtotal (€)", "Descuento (€)", "Envío (€)", "Total (€)", "Cupón", "Promoción", "Premio fidelidad (€)"],
    ...orders.map((o) => [
      fmt.format(o.createdAt).replace(", ", " "),
      o.orderNumber,
      o.customerName,
      o.customerPhone,
      o.channel === "DELIVERY" ? "A domicilio" : "Para recoger",
      STATUS[o.status] ?? o.status,
      o.lines.map((l) => `${l.quantity}× ${l.productName}`).join(", "),
      eur(o.subtotalCents),
      eur(o.discountCents),
      eur(o.feesCents),
      eur(o.totalCents),
      o.couponCode,
      o.promotionName ?? null,
      o.loyaltyDiscountCents ? eur(o.loyaltyDiscountCents) : null,
    ]),
  ];
  const slug = new URL(req.url).pathname.split("/")[3];
  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${slug}-${range.from}_${range.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
