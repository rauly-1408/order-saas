import { notFound } from "next/navigation";
import CheckoutClient from "./CheckoutClient";
import { loadMenu } from "@/app/lib/menu";
import { prisma } from "@/app/lib/prisma";
import { storeLang } from "@/app/lib/storeLang";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const settings = (await prisma.tenant.findUnique({ where: { slug: tenant }, select: { settings: true } }))?.settings;
  const menu = await loadMenu(tenant, await storeLang(settings));
  if (!menu) notFound();
  // El campo de cupón solo aparece si el restaurante tiene el motor de retención.
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { addons: true } });
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
    />
  );
}
