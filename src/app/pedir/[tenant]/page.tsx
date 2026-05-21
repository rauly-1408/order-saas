import MenuClient from "./MenuClient";
import { prisma } from "@/app/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PedirPage({
      params,
}: {
      params: Promise<{ tenant: string }>;
}) {
      const { tenant: tenantSlug } = await params;

  try {
          const tenant = await prisma.tenant.findUnique({
                    where: { slug: tenantSlug },
                    select: { id: true, name: true, slug: true },
          });

        if (!tenant) {
                  redirect(`/error?msg=tenant-not-found&slug=${tenantSlug}`);
        }

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
  } catch (e: unknown) {
          const msg = encodeURIComponent(e instanceof Error ? e.message : String(e));
          const hasDb = process.env.DATABASE_URL ? "yes" : "no";
          redirect(`/error?msg=${msg}&db=${hasDb}&slug=${tenantSlug}`);
  }
}
