import { requireAreaPage } from "@/app/lib/auth";
import ReservasClient from "./ReservasClient";

// Reservas del día: las de la tienda y las que se apuntan por teléfono. Lo
// usan quienes tienen acceso a Mesas. Ver docs/RESERVAS.md
export default async function ReservasPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ fecha?: string }> }) {
  const { tenant } = await params;
  const { fecha } = await searchParams;
  const access = await requireAreaPage(tenant, "mesas");
  return <ReservasClient tenant={tenant} initialDate={fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null} canConfigure={access.manager} />;
}
