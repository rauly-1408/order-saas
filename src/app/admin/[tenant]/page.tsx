import { redirect } from "next/navigation";
import { getSession } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import AdminPanel from "./AdminPanel";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  const session = await getSession();
  if (!session) redirect(`/admin/${tenant}/login`);

  // Scoping de tenant: salvo SUPERADMIN, solo accede a su propio negocio.
  if (session.role !== "SUPERADMIN") {
    const t = await prisma.tenant.findUnique({
      where: { slug: tenant },
      select: { id: true },
    });
    if (!t || session.tenantId !== t.id) redirect(`/admin/${tenant}/login`);
  }

  return <AdminPanel tenant={tenant} />;
}
