import PersonalizacionClient from "./PersonalizacionClient";

export default async function PersonalizacionPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <PersonalizacionClient tenant={tenant} />;
}
