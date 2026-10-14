import { notFound } from "next/navigation";
import CheckoutClient from "./CheckoutClient";
import { loadMenu } from "@/app/lib/menu";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  const menu = await loadMenu(tenant);
  if (!menu) notFound();
  return <CheckoutClient tenant={tenant} theme={menu.theme} settings={menu.settings} />;
}
