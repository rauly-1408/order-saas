import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getTenantTheme, themeToCssVars, SYSTEM_DEFAULT_THEME } from "@/app/lib/tenantConfig";
import { readBusiness } from "@/app/lib/business";
import { readReservationSettings } from "@/app/lib/reservations";
import { resolveStoreId } from "@/app/lib/stores";
import { shopStoreId, storeLang } from "@/app/lib/storeLang";
import { addDays, localParts, tenantTimeZone } from "@/app/lib/time";
import ReservarClient from "./ReservarClient";

export const dynamic = "force-dynamic";

// «Reserva tu mesa»: personas, día, hora y datos. Ver docs/RESERVAS.md
export default async function ReservarPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ fecha?: string; personas?: string }> }) {
  const { tenant } = await params;
  const q = await searchParams;
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { id: true, name: true, branding: true, settings: true } });
  if (!t) notFound();
  const lang = await storeLang(t.settings);
  const cssVars = themeToCssVars(getTenantTheme((t.branding as Record<string, unknown>) ?? {}) ?? SYSTEM_DEFAULT_THEME);
  const settings = readReservationSettings(t.settings);
  const storeId = await resolveStoreId(t.id, await shopStoreId(), { activeOnly: true });
  const tz = tenantTimeZone(t.settings);
  const today = localParts(new Date(), tz).ymd;
  const days = Array.from({ length: Math.min(settings.maxDaysAhead, 30) + 1 }, (_, i) => addDays(today, i));
  const logoUrl = typeof (t.branding as Record<string, unknown>)?.logoUrl === "string" ? ((t.branding as Record<string, unknown>).logoUrl as string) : null;
  return (
    <ReservarClient
      tenant={tenant}
      name={t.name}
      logoUrl={logoUrl}
      cssVars={cssVars}
      lang={lang}
      enabled={settings.enabled && !!storeId}
      storeId={storeId}
      maxGuests={settings.maxGuestsOnline}
      note={settings.customerNote}
      days={days}
      phone={readBusiness(t.settings).phone}
      // Enlace del aviso de la lista de espera: día y personas ya elegidos.
      initialDay={q.fecha && days.includes(q.fecha) ? q.fecha : undefined}
      initialGuests={Number(q.personas) >= 1 && Number(q.personas) <= settings.maxGuestsOnline ? Math.floor(Number(q.personas)) : undefined}
    />
  );
}
