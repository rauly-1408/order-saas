import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ tenant: string; id: string }> };

async function context(req: NextRequest, params: Context["params"]) {
  const { tenant: slug, id } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant, id };
}

// PATCH { name?, phone?, notes?, active? }
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const c = await context(req, params);
    if ("error" in c) return c.error;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const data: { name?: string; phone?: string | null; notes?: string | null; active?: boolean; accessCodeHash?: string | null; accessCodeIssuedAt?: Date | null } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80) {
        return NextResponse.json({ error: "Introduce un nombre de hasta 80 caracteres" }, { status: 400 });
      }
      data.name = body.name.trim();
    }
    if (body.phone !== undefined) {
      if (typeof body.phone !== "string" || body.phone.trim().length > 30) return NextResponse.json({ error: "Teléfono no válido" }, { status: 400 });
      data.phone = body.phone.trim() || null;
    }
    if (body.notes !== undefined) {
      if (typeof body.notes !== "string" || body.notes.trim().length > 500) return NextResponse.json({ error: "Las notas no pueden superar los 500 caracteres" }, { status: 400 });
      data.notes = body.notes.trim() || null;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") return NextResponse.json({ error: "Estado no válido" }, { status: 400 });
      data.active = body.active;
      if (!body.active) {
        data.accessCodeHash = null;
        data.accessCodeIssuedAt = null;
      }
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: "No hay cambios que guardar" }, { status: 400 });

    const result = await prisma.deliveryRider.updateMany({ where: { id: c.id, tenantId: c.tenant.id }, data });
    if (!result.count) return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });
    const courier = await prisma.deliveryRider.findFirst({
      where: { id: c.id, tenantId: c.tenant.id },
      select: { id: true, name: true, phone: true, notes: true, active: true, createdAt: true, updatedAt: true },
    });
    return NextResponse.json({ courier });
  } catch (error) {
    console.error("[PATCH /api/admin/repartidores]", error);
    return NextResponse.json({ error: "No se pudo actualizar el repartidor" }, { status: 500 });
  }
}

// DELETE is a soft delete: keeps the record for future order history/audit.
export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const c = await context(req, params);
    if ("error" in c) return c.error;
    const result = await prisma.deliveryRider.updateMany({
      where: { id: c.id, tenantId: c.tenant.id },
      data: { active: false, accessCodeHash: null, accessCodeIssuedAt: null },
    });
    if (!result.count) return NextResponse.json({ error: "Repartidor no encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/admin/repartidores]", error);
    return NextResponse.json({ error: "No se pudo dar de baja el repartidor" }, { status: 500 });
  }
}
