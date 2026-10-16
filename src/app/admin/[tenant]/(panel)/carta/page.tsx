import { requireManagerPage } from "@/app/lib/auth";
import CartaTabs from "./CartaTabs";

export default async function CartaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  return <CartaTabs tenant={tenant} />;
}
