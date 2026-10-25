import { requireManagerPage } from "@/app/lib/auth";
import ColaboradoresClient from "./ColaboradoresClient";

export default async function ColaboradoresPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  return <ColaboradoresClient tenant={tenant} />;
}
