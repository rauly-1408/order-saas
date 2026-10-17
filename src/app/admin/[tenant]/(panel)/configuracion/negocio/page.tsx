import NegocioClient from "./NegocioClient";

export default async function NegocioPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <NegocioClient tenant={tenant} />;
}
