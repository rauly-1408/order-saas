import { notFound } from "next/navigation";
import MenuClient from "./MenuClient";
import { loadMenu } from "@/app/lib/menu";
import { prisma } from "@/app/lib/prisma";
import { shopStoreId, storeLang } from "@/app/lib/storeLang";

export const dynamic = "force-dynamic";

export default async function PedirPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { settings: true } });
  const menu = await loadMenu(tenant, await storeLang(t?.settings), await shopStoreId());
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
      online={menu.online}
      deliveryPartners={menu.deliveryPartners}
      business={menu.business}
      hours={menu.hours}
      lang={menu.lang}
      languages={menu.languages}
      stores={menu.stores}
      storeId={menu.storeId}
    />
  );
}
