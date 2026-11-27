import RepartidorPortal from "./RepartidorPortal";

export default async function RepartidorPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <RepartidorPortal tenant={tenant} />;
}
