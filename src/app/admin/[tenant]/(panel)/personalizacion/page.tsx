import { requireManagerPage } from "@/app/lib/auth";
import PersonalizacionClient from "./PersonalizacionClient";

export default async function PersonalizacionPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  return <PersonalizacionClient tenant={tenant} />;
}
