import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import AdminSidebar from "./AdminSidebar";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  // Todas las páginas del panel exigen sesión. proxy.ts solo mira si existe la
  // cookie; aquí se verifica la firma y que el usuario sea de este tenant.
  const session = await getSession();
  if (!session) redirect(`/admin/${tenant}/login`);

  const tenantData = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { id: true, name: true, branding: true },
  });
  if (!tenantData) redirect(`/admin/${tenant}/login`);
  if (session.role !== "SUPERADMIN" && session.tenantId !== tenantData.id) {
    redirect(`/admin/${tenant}/login`);
  }

  const tenantName = tenantData.name;
  const branding = (tenantData.branding ?? {}) as Record<string, unknown>;
  const logoUrl = (branding.logoUrl as string) ?? null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7f7fb' }}>
      <AdminSidebar tenant={tenant} tenantName={tenantName} logoUrl={logoUrl} />
      <main style={{ flex: 1, minWidth: 0, padding: '32px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
