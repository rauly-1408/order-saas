import { notFound } from "next/navigation";
import MenuClient from "./MenuClient";
import type { Metadata } from "next";
import { loadMenu } from "@/app/lib/menu";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { name: true } });
  return { title: t?.name ?? "Carta" };
}

export default async function PedirPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const menu = await loadMenu(tenant);
  if (!menu) notFound();

  return (
    <MenuClient
      tenant={tenant}
      tenantName={menu.tenant.name}
      categories={menu.categories}
      theme={menu.theme}
      settings={menu.settings}
      store={menu.store}
      perks={menu.perks}
    />
  );
}
