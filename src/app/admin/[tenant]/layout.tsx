import { prisma } from "@/app/lib/prisma";
import AdminSidebar from "./AdminSidebar";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;

  // Load tenant name for the sidebar header
  const tenantData = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { name: true, branding: true },
  });

  const tenantName = tenantData?.name ?? tenant;
  const branding = (tenantData?.branding ?? {}) as Record<string, unknown>;
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
