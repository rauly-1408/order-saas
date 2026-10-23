import { getSession, requireManagerPage } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { localParts, tenantTimeZone } from "@/app/lib/time";
import InformesClient from "./InformesClient";

export default async function InformesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  const session = await getSession();
  if (!session?.seesTakings) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-[var(--p-surface)] p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h1 className="text-xl font-semibold">Informes</h1>
        <p className="mt-2 text-sm text-[var(--p-muted)]">Las ventas solo las ve quien tiene el permiso «Ve lo recaudado». Pídeselo al administrador principal (Configuración → Usuarios y permisos).</p>
      </div>
    );
  }
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { settings: true } });
  // "Hoy" en la hora del restaurante, para que los atajos de periodo cuadren.
  const today = localParts(new Date(), tenantTimeZone(t?.settings)).ymd;
  return <InformesClient tenant={tenant} today={today} />;
}
