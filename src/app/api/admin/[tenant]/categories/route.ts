import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSlug(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  const adminIdx = parts.indexOf("admin");
  return parts[adminIdx + 1];
}

// POST /api/admin/[tenant]/categories
export async function POST(req: NextRequest) {
  try {
    const slug = getSlug(req);
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });

    const body = await req.json();
    const { name, description, imageUrl, sortOrder, isActive, isFeatured } = body;
    if (!name?.trim()) return NextResponse.json({ error: "name requerido" }, { status: 400 });

    // Generate slug from name
    const catSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const unique = catSlug + '-' + Date.now();

    const category = await prisma.category.create({
      data: {
        tenantId: tenant.id,
        name: name.trim(),
        slug: unique,
        description: description?.trim() ?? null,
        imageUrl: imageUrl?.trim() ?? null,
        sortOrder: sortOrder ?? 0,
        isActive: isActive ?? true,
        isFeatured: isFeatured ?? false,
      },
    });

    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
