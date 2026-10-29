import { requireAreaPage } from "@/app/lib/auth";
import AdminPanel from "./AdminPanel";

// Pedidos: todos los puestos. Cocina y barra ven solo sus líneas y solo
// pueden prepararlos; cobrar y cancelar dependen del puesto (lib/roles.ts).
export default async function PedidosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const access = await requireAreaPage(tenant, "pedidos");
  return <AdminPanel tenant={tenant} perms={{ station: access.station, canCharge: access.cobrar, canCancel: access.anular || access.caja, canInvoice: access.facturas }} />;
}
