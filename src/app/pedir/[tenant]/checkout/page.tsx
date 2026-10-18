import { notFound } from "next/navigation";
import CheckoutClient from "./CheckoutClient";
import { loadMenu } from "@/app/lib/menu";
import { prisma } from "@/app/lib/prisma";
import { shopStoreId, storeLang } from "@/app/lib/storeLang";
import { paymentOptions } from "@/app/lib/gateways";
import { readCheckout } from "@/app/lib/storePolicies";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const settings = (await prisma.tenant.findUnique({ where: { slug: tenant }, select: { settings: true } }))?.settings;
  const menu = await loadMenu(tenant, await storeLang(settings), await shopStoreId());
  if (!menu) notFound();
  // El campo de cupón solo aparece si el restaurante tiene el motor de retención.
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { id: true, addons: true, settings: true } });
  // Tarjetas regalo: el campo solo sale si el restaurante tiene alguna activa.
  const giftCardsEnabled = t ? (await prisma.giftCard.count({ where: { tenantId: t.id, active: true, balanceCents: { gt: 0 } } })) > 0 : false;
  // Formas de pago que el restaurante tiene activadas (su pasarela, Bizum, en el local).
  const payment = t ? await paymentOptions(t.id) : { card: false, bizum: false, inStore: true, test: false };
  const couponsEnabled = t?.addons.includes("RETENTION") ?? false;
  // Categoría y precio base de cada producto: para calcular el premio de la tarjeta.
  const productInfo = Object.fromEntries(menu.categories.flatMap((c) => c.products.map((p) => [p.id, { categoryId: c.id, basePriceCents: p.basePriceCents }])));
  return (
    <CheckoutClient
      tenant={tenant}
      theme={menu.theme}
      settings={menu.settings}
      store={menu.store}
      couponsEnabled={couponsEnabled}
      perks={menu.perks}
      productInfo={productInfo}
      deliveryPartners={menu.deliveryPartners}
      lang={menu.lang}
      payment={payment}
      checkout={readCheckout(t?.settings)}
      giftCardsEnabled={giftCardsEnabled}
      storeId={menu.storeId}
      storeName={menu.stores.length > 1 ? menu.stores.find((st) => st.id === menu.storeId)?.name ?? null : null}
    />
  );
}
