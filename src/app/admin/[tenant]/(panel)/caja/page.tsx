import { getSession, requireAreaPage } from "@/app/lib/auth";
import { canManageTenant } from "@/app/lib/roles";
import CajaClient from "./CajaClient";

// Caja: tomar pedidos en mostrador y por teléfono desde el panel. La usan el
// gerente, el encargado y la caja (lib/roles.ts).
export default async function CajaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireAreaPage(tenant, "caja");
  const session = await getSession();
  return <CajaClient tenant={tenant} canSeeTakings={Boolean(session?.seesTakings)} canDiscount={canManageTenant(session?.role ?? "")} />;
}
