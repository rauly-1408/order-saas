import { requireManagerPage } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import { localParts, tenantTimeZone } from "@/app/lib/time";
import InformesClient from "./InformesClient";

export default async function InformesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { settings: true } });
  // "Hoy" en la hora del restaurante, para que los atajos de periodo cuadren.
  const today = localParts(new Date(), tenantTimeZone(t?.settings)).ymd;
  return <InformesClient tenant={tenant} today={today} />;
}
