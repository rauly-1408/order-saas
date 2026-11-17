import { notFound } from "next/navigation";
import MenuClient from "./MenuClient";
import { loadMenu } from "@/app/lib/menu";
import { prisma } from "@/app/lib/prisma";
import { shopStoreId, storeLang } from "@/app/lib/storeLang";
import { readReservationSettings } from "@/app/lib/reservations";
import { headers } from "next/headers";
import { restaurantJsonLd } from "@/app/lib/seo";

export const dynamic = "force-dynamic";

export default async function PedirPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { settings: true } });
  const menu = await loadMenu(tenant, await storeLang(t?.settings), await shopStoreId(), { online: true });
  if (!menu) notFound();
  // Ficha de restaurante para Google (datos estructurados schema.org).
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}`;
  const ld = restaurantJsonLd({ name: menu.tenant.name, url: `${origin}/pedir/${tenant}`, business: menu.business, online: menu.online, image: menu.theme.heroImageUrl ?? null, reservations: readReservationSettings(t?.settings).enabled });

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
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
      reservations={readReservationSettings(t?.settings).enabled}
    />
    </>
  );
}
