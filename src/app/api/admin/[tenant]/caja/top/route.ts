import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/caja/top → los productos que más salen (unidades de
// los últimos 30 días, sin importes) para la pestaña «Más vendidos» de la Caja.
// Cualquier usuario del restaurante. Ver docs/CAJA.md

export type TopResponse = { productIds: string[] };

export async function GET(req: NextRequest) {
  try {
    const slug = new URL(req.url).pathname.split("/").at(-3) ?? "";
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    const noArea = denyUnlessArea(session, "caja");
    if (noArea) return noArea;

    const since = new Date(Date.now() - 30 * 86_400_000);
    const rows = await prisma.orderLine.groupBy({
      by: ["productId"],
      where: { order: { tenantId: tenant.id, createdAt: { gte: since }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 12,
    });
    const productIds = rows.map((r) => r.productId);
    return NextResponse.json({ productIds } satisfies TopResponse);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
