import { notFound } from "next/navigation";
import CheckoutClient from "./CheckoutClient";
import { loadMenu } from "@/app/lib/menu";
import { prisma } from "@/app/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const menu = await loadMenu(tenant);
  if (!menu) notFound();
  // El campo de cupón solo aparece si el restaurante tiene el motor de retención.
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { addons: true } });
  const couponsEnabled = t?.addons.includes("RETENTION") ?? false;
  return <CheckoutClient tenant={tenant} theme={menu.theme} settings={menu.settings} couponsEnabled={couponsEnabled} />;
}
