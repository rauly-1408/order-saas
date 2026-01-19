import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: { tenant: string } }
) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenant },
    select: { id: true, name: true, slug: true, branding: true, settings: true },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id },
    orderBy: { sortOrder: "asc" },
    include: {
      products: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: {
          productModifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: {
              group: { include: { options: { orderBy: { sortOrder: "asc" } } } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ tenant, categories });
}
