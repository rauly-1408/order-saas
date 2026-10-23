import { getSession } from "@/app/lib/auth";
import CajaClient from "./CajaClient";

// Caja: tomar pedidos en mostrador y por teléfono desde el panel. Lo usa
// también el rol «Pedidos» (cocina/mostrador): el layout ya exige sesión.
export default async function CajaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const session = await getSession();
  return <CajaClient tenant={tenant} canSeeTakings={Boolean(session?.seesTakings)} />;
}
