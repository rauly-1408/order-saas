import { NextRequest, NextResponse, after } from "next/server";
import { autoTranslateMenu } from "@/app/lib/menuTranslate";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getParams(req: NextRequest): { tenantSlug: string; categoryId: string } {
  const parts = new URL(req.url).pathname.split("/");
  const adminIdx = parts.indexOf("admin");
  return { tenantSlug: parts[adminIdx + 1], categoryId: parts[parts.length - 1] };
}

// PATCH /api/admin/[tenant]/categories/[categoryId] → renombrar u ocultar una categoría
export async function PATCH(req: NextRequest) {
  try {
    const { tenantSlug, categoryId } = getParams(req);
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    const denied = await denyUnlessTenantAdmin(req, tenant.id);
    if (denied) return denied;
    // Carta en inglés: lo nuevo o cambiado se traduce solo, después de responder.
    after(() => autoTranslateMenu(tenant.id));

    const category = await prisma.category.findFirst({ where: { id: categoryId, tenantId: tenant.id } });
    if (!category) return NextResponse.json({ error: "Categoría no encontrada" }, { status: 404 });

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : undefined;
    if (name !== undefined && !name) return NextResponse.json({ error: "La categoría necesita un nombre" }, { status: 400 });

    const updated = await prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(name !== undefined && { name }),
        ...(typeof body.isActive === "boolean" && { isActive: body.isActive }),
        ...(Number.isInteger(body.sortOrder) && { sortOrder: body.sortOrder }),
      },
    });
    return NextResponse.json({ ok: true, category: updated });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
