import { requireManagerPage } from "@/app/lib/auth";
import ConfiguracionClient from "./ConfiguracionClient";

export default async function ConfiguracionPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  return <ConfiguracionClient tenant={tenant} />;
}
