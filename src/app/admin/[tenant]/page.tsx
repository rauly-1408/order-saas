import AdminPanel from "./AdminPanel";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  return <AdminPanel tenant={tenant} />;
}
