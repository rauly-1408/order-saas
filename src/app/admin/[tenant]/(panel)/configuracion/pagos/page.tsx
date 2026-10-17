import Pagos from "./Pagos";

export default async function PagosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <Pagos tenant={tenant} />;
}
