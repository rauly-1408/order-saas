import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessArea, getSessionFromRequest } from "@/app/lib/auth";
import { kitchenTickets, markRoundReady, type KitchenView } from "@/app/lib/kitchen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET  /api/admin/[tenant]/cocina?vista=COCINA|BARRA|TODO → comandas pendientes.
// POST /api/admin/[tenant]/cocina { orderId, round, vista } → ronda de mesa lista.
// Los pedidos (online y Caja) cambian de estado con /api/orders/status como en
// Pedidos. Cualquiera con acceso a Pedidos. Ver docs/PANTALLA-COCINA.md

const viewOf = (v: unknown): KitchenView => (v === "COCINA" || v === "BARRA" ? v : "TODO");

async function ctx(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").at(-2) ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const session = await getSessionFromRequest(req);
  if (!session) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return { error: NextResponse.json({ error: "Prohibido" }, { status: 403 }) };
  const noArea = denyUnlessArea(session, "pedidos");
  if (noArea) return { error: noArea };
  return { tenant, session };
}

export async function GET(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const r = await kitchenTickets(c.tenant.id, c.session.storeId ?? null, c.session, viewOf(new URL(req.url).searchParams.get("vista")));
    return NextResponse.json(r);
  } catch (err) {
    console.error("[GET /api/admin/cocina]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const c = await ctx(req);
    if ("error" in c) return c.error;
    const b = (await req.json().catch(() => ({}))) as { orderId?: unknown; round?: unknown; vista?: unknown };
    if (typeof b.orderId !== "string" || !Number.isInteger(b.round)) return NextResponse.json({ error: "Comanda no válida" }, { status: 400 });
    const marked = await markRoundReady(c.tenant.id, b.orderId, b.round as number, c.session, viewOf(b.vista));
    return NextResponse.json({ marked });
  } catch (err) {
    console.error("[POST /api/admin/cocina]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
