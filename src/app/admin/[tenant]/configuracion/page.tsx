import ConfiguracionClient from "./ConfiguracionClient";

export default async function ConfiguracionPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <ConfiguracionClient tenant={tenant} />;
}
