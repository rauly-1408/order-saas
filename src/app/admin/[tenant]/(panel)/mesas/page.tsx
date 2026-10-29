import { requireAreaPage } from "@/app/lib/auth";
import MesasClient from "./MesasClient";

// Mesas: plano de la sala, cuentas abiertas por mesa, rondas y cobro. Lo usan
// el gerente, el encargado, la caja y los camareros. Ver docs/MESAS.md
export default async function MesasPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireAreaPage(tenant, "mesas");
  return <MesasClient tenant={tenant} />;
}
