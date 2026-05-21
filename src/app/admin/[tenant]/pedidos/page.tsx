import PedidosClient from "./PedidosClient";

export default async function PedidosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <PedidosClient tenant={tenant} />;
}
