import { getSession, requireAreaPage } from "@/app/lib/auth";
import { canManageTenant } from "@/app/lib/roles";
import CajaClient from "../../caja/CajaClient";

// Pedido por teléfono: desde Pedidos («＋ Pedido por teléfono»). Es la pantalla
// de la Caja en modo teléfono: sin caja, con el teléfono del cliente y cobro al
// recoger o al entregar. Ver docs/CAJA.md
export default async function PedidoTelefonoPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireAreaPage(tenant, "pedidos");
  const session = await getSession();
  return <CajaClient tenant={tenant} phoneMode canSeeTakings={Boolean(session?.seesTakings)} canDiscount={canManageTenant(session?.role ?? "")} />;
}
