import { getSession, requireAreaPage } from "@/app/lib/auth";
import { canManageTenant } from "@/app/lib/roles";
import CajaPanel from "./CajaPanel";

// Caja: el dinero (abrir, cerrar, entradas y salidas, lo vendido hoy). Los
// pedidos se toman con «＋ Nuevo pedido» (aquí o en Pedidos). La usan el
// gerente, el encargado y la caja (lib/roles.ts). Ver docs/CAJA.md
export default async function CajaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const access = await requireAreaPage(tenant, "caja");
  const session = await getSession();
  const seesTakings = Boolean(session?.seesTakings);
  return <CajaPanel tenant={tenant} canSeeTakings={seesTakings} newOrder={{ canSeeTakings: seesTakings, canDiscount: canManageTenant(session?.role ?? ""), canCounter: true, canPhone: access.pedidos }} />;
}
