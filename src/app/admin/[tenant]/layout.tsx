import type { Metadata } from "next";
import { prisma } from "@/app/lib/prisma";
import { tenantIcons } from "@/app/lib/tenantIcons";

// Todas las páginas del panel de un restaurante (entrada, recuperar contraseña,
// facturas…) llevan su favicon oficial en la pestaña. El panel lo repite junto
// a su icono de app en (panel)/layout.tsx.
export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { branding: true } });
  const icons = tenantIcons(t?.branding);
  return icons ? { icons } : {};
}

export default function TenantAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
