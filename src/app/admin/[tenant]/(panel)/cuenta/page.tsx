import { getSession } from "@/app/lib/auth";
import { ROLE_LABEL } from "@/app/lib/roles";
import CuentaClient from "./CuentaClient";

// Mi cuenta: cualquier usuario del panel (también el rol «Pedidos») ve su
// usuario y cambia su contraseña. El layout ya exige sesión.
export default async function CuentaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const session = await getSession();
  return <CuentaClient tenant={tenant} email={session?.email ?? ""} role={ROLE_LABEL[session?.role ?? ""] ?? ""} seesTakings={Boolean(session?.seesTakings)} />;
}
