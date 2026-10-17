import Operativa from "../Operativa";

export default async function HorarioPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <Operativa tenant={tenant} />;
}
