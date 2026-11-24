import { getSession } from "@/app/lib/auth";
import { canManageTenant } from "@/app/lib/roles";
import { loadManual } from "@/app/lib/manual";
import AyudaClient from "./AyudaClient";

// Ayuda: el manual de uso del panel (docs/manual), por secciones y con buscador.
// Lo ve todo el equipo. Ver docs/MANUAL.md
export default async function AyudaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const session = await getSession();
  const manual = loadManual();
  return <AyudaClient tenant={tenant} manual={manual} canAsk={!!session && canManageTenant(session.role)} />;
}
