import { notFound } from "next/navigation";
import MenuClient from "./MenuClient";
import { loadMenu } from "@/app/lib/menu";

export const dynamic = "force-dynamic";

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
      online={menu.online}
      deliveryPartners={menu.deliveryPartners}
    />
  );
}
