import { getSession, requireAreaPage } from "@/app/lib/auth";
import { canManageTenant } from "@/app/lib/roles";
import AdminPanel from "./AdminPanel";

// Pedidos: todos los puestos. Cocina y barra ven solo sus líneas y solo
// pueden prepararlos; cobrar y cancelar dependen del puesto (lib/roles.ts).
// «＋ Nuevo pedido» se abre encima (NewOrder.tsx): en el local si el puesto
// tiene Caja, por teléfono si tiene Pedidos.
export default async function PedidosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const access = await requireAreaPage(tenant, "pedidos");
  const session = await getSession();
  return (
    <AdminPanel
      tenant={tenant}
      perms={{ station: access.station, canCharge: access.cobrar, canCancel: access.anular || access.caja, canInvoice: access.facturas }}
      newOrder={access.station ? null : { canSeeTakings: Boolean(session?.seesTakings), canDiscount: canManageTenant(session?.role ?? ""), canCounter: access.caja, canPhone: access.pedidos }}
    />
  );
}
