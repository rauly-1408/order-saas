import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function context(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1] ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

// GET /api/admin/[tenant]/repartidores
export async function GET(req: NextRequest) {
  try {
    const c = await context(req);
    if ("error" in c) return c.error;
    const couriers = await prisma.deliveryRider.findMany({
      where: { tenantId: c.tenant.id },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, phone: true, notes: true, active: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ couriers });
  } catch (error) {
    console.error("[GET /api/admin/repartidores]", error);
    return NextResponse.json({ error: "No se pudieron cargar los repartidores" }, { status: 500 });
  }
}

// POST { name, phone?, notes? }
export async function POST(req: NextRequest) {
  try {
    const c = await context(req);
    if ("error" in c) return c.error;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    if (!name || name.length > 80) return NextResponse.json({ error: "Introduce un nombre de hasta 80 caracteres" }, { status: 400 });
    if (phone.length > 30) return NextResponse.json({ error: "El teléfono no puede superar los 30 caracteres" }, { status: 400 });
    if (notes.length > 500) return NextResponse.json({ error: "Las notas no pueden superar los 500 caracteres" }, { status: 400 });

    const courier = await prisma.deliveryRider.create({
      data: { tenantId: c.tenant.id, name, phone: phone || null, notes: notes || null },
      select: { id: true, name: true, phone: true, notes: true, active: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ courier }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/repartidores]", error);
    return NextResponse.json({ error: "No se pudo crear el repartidor" }, { status: 500 });
  }
}
