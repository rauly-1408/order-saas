import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/[tenant]/caja/cliente?telefono=600123456 → el cliente de ese
// teléfono para un pedido por teléfono: su nombre, cuántos pedidos lleva y sus
// últimas direcciones de entrega (para elegir una con un toque). Ver docs/CAJA.md

export type ClienteResponse = { found: boolean; name: string | null; orders: number; addresses: { address: string; postalCode: string | null }[] };

const PHONE = /^(?:\+34|0034)?[6789]\d{8}$/;

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const slug = url.pathname.split("/").at(-3) ?? "";
    const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    const noArea = denyUnlessArea(session, "caja");
    if (noArea) return noArea;

    const phone = (url.searchParams.get("telefono") ?? "").replace(/[\s-]/g, "");
    if (!PHONE.test(phone)) return NextResponse.json({ error: "Teléfono no válido" }, { status: 400 });
    const customer = await prisma.customer.findUnique({ where: { tenantId_phone: { tenantId: tenant.id, phone } }, select: { name: true, ordersCount: true } });
    // Direcciones de sus pedidos a domicilio, la más reciente primero y sin repetir.
    const recent = await prisma.order.findMany({
      where: { tenantId: tenant.id, customerPhone: phone, customerAddress: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { customerAddress: true, customerPostalCode: true, customerName: true },
    });
    const seen = new Set<string>();
    const addresses: ClienteResponse["addresses"] = [];
    for (const o of recent) {
      const a = o.customerAddress?.trim();
      if (!a || seen.has(a.toLowerCase())) continue;
      seen.add(a.toLowerCase());
      addresses.push({ address: a, postalCode: o.customerPostalCode });
      if (addresses.length >= 3) break;
    }
    const name = customer?.name?.trim() || recent.find((o) => o.customerName && !["Teléfono", "Mostrador"].includes(o.customerName))?.customerName || null;
    const body: ClienteResponse = { found: Boolean(customer || recent.length), name, orders: customer?.ordersCount ?? 0, addresses };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[GET /api/admin/caja/cliente]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
