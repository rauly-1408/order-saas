import MenuClient from "./MenuClient";
import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, getTenantSettings } from "@/app/lib/tenantConfig";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PedirPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      branding: true,
      settings: true,
      stores: {
        take: 1,
        select: {
          id: true,
          deliveryEnabled: true,
          takeawayEnabled: true,
          estimatedDeliveryMinutes: true,
          estimatedPickupMinutes: true,
        },
      },
    },
  });

  if (!tenant) notFound();

  const categories = await prisma.category.findMany({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      products: {
        where: { isActive: true, isAvailable: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          description: true,
          basePriceCents: true,
          imageUrl: true,
          isFeatured: true,
          hasModifiers: true,
        },
      },
    },
  });

  const theme = getTenantTheme(tenant.branding as Record<string, unknown>);
  const settings = getTenantSettings(tenant.settings as Record<string, unknown>);

  return (
    <MenuClient
      tenant={tenantSlug}
      tenantName={tenant.name}
      categories={categories}
      theme={theme}
      settings={settings}
    />
  );
}
