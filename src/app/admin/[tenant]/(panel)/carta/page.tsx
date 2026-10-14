import CartaClient from "./CartaClient";

export default async function CartaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <CartaClient tenant={tenant} />;
}
