import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Sucursales: los locales del restaurante. Ver docs/CONFIGURACION.md
async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenantId: tenant.id };
}

const text = (v: unknown, max = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function list(tenantId: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const stores = await prisma.store.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, address: true, phone: true, active: true, sortOrder: true, _count: { select: { deliveryZones: true } } },
  });
  const orders = await prisma.order.groupBy({ by: ["storeId"], where: { tenantId, createdAt: { gte: since }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } }, _count: true });
  const byStore = new Map(orders.map((o) => [o.storeId, o._count]));
  return stores.map((s) => ({ id: s.id, name: s.name, address: s.address, phone: s.phone, active: s.active, zones: s._count.deliveryZones, orders30d: byStore.get(s.id) ?? 0 }));
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json({ stores: await list(c.tenantId) });
}

// POST { name, address, phone } → nuevo local. Copia canales, precios y tiempos
// del primero (son comunes); el horario y las zonas se configuran aparte.
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = text(b.name, 80);
  if (!name) return NextResponse.json({ error: "Ponle un nombre al local" }, { status: 400 });
  const first = await prisma.store.findFirst({ where: { tenantId: c.tenantId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const count = await prisma.store.count({ where: { tenantId: c.tenantId } });
  if (count >= 50) return NextResponse.json({ error: "Demasiados locales" }, { status: 400 });
  await prisma.store.create({
    data: {
      tenantId: c.tenantId,
      name,
      address: text(b.address),
      phone: text(b.phone, 30),
      sortOrder: count,
      ...(first && {
        deliveryEnabled: first.deliveryEnabled,
        takeawayEnabled: first.takeawayEnabled,
        minimumOrderCents: first.minimumOrderCents,
        deliveryFeeCents: first.deliveryFeeCents,
        estimatedDeliveryMinutes: first.estimatedDeliveryMinutes,
        estimatedPickupMinutes: first.estimatedPickupMinutes,
        openingHours: first.openingHours ?? {},
      }),
    },
  });
  return NextResponse.json({ stores: await list(c.tenantId) });
}

// PATCH { id, name?, address?, phone?, active? }
export async function PATCH(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const store = typeof b.id === "string" ? await prisma.store.findFirst({ where: { id: b.id, tenantId: c.tenantId } }) : null;
  if (!store) return NextResponse.json({ error: "Local no encontrado" }, { status: 404 });
  if (b.active === false && store.active) {
    const activeCount = await prisma.store.count({ where: { tenantId: c.tenantId, active: true } });
    if (activeCount <= 1) return NextResponse.json({ error: "Tiene que quedar al menos un local abierto al público" }, { status: 400 });
  }
  if (b.name !== undefined && !text(b.name, 80)) return NextResponse.json({ error: "El local necesita un nombre" }, { status: 400 });
  await prisma.store.update({
    where: { id: store.id },
    data: {
      ...(b.name !== undefined && { name: text(b.name, 80)! }),
      ...(b.address !== undefined && { address: text(b.address) }),
      ...(b.phone !== undefined && { phone: text(b.phone, 30) }),
      ...(typeof b.active === "boolean" && { active: b.active }),
    },
  });
  return NextResponse.json({ stores: await list(c.tenantId) });
}
