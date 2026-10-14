import { requireManagerPage } from "@/app/lib/auth";
import CartaClient from "./CartaClient";

export default async function CartaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  return <CartaClient tenant={tenant} />;
}
