import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ tenant: string }> }
) {
  try {
    const { tenant: tenantSlug } = await context.params;

    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: {
        id: true,
        slug: true,
        name: true,
        branding: true,
        settings: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    const categories = await prisma.category.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        products: {
          where: { isActive: true },
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            basePriceCents: true,
          },
        },
      },
    });

    return NextResponse.json({ tenant, categories });
  } catch (e) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}


