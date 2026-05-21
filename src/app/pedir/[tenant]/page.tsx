import MenuClient from "./MenuClient";
import { prisma } from "@/app/lib/prisma";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PedirPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  // Buscar el tenant por slug
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!tenant) notFound();

  // Cargar categorías activas con sus productos disponibles
  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      products: {
        where: { isActive: true, isAvailable: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          basePriceCents: true,
          imageUrl: true,
        },
      },
    },
  });

  return (
    <MenuClient
      tenant={tenantSlug}
      tenantName={tenant.name}
      categories={categories}
    />
  );
}
