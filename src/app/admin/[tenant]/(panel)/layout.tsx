import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import { canManageTenant } from "@/app/lib/roles";
import { Anton, Inter } from "next/font/google";
import { panelBrand, panelCssVars } from "@/app/lib/panelTheme";
import AdminSidebar from "./AdminSidebar";

// Texto: tipografía del sistema de Apple (SF) con Inter como respaldo fuera de
// Apple. Titulares de marca: condensada en mayúsculas, como la carta impresa.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant } = await params;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { name: true } });
  return { title: { absolute: `Panel · ${t?.name ?? tenant}` } };
}

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
    <div className={`panel ${inter.variable} ${display.variable} flex min-h-screen`} style={panelCssVars(panelBrand(branding))}>
      <AdminSidebar tenant={tenant} tenantName={tenantName} logoUrl={logoUrl} canManage={canManageTenant(session.role)} />
      {/* pt-20 en móvil deja sitio a la barra superior fija */}
      <main className="min-w-0 flex-1 overflow-y-auto px-4 pt-20 pb-12 lg:px-10 lg:pt-10">
        <div className="p-page mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
