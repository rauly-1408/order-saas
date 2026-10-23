import MesasClient from "./MesasClient";

// Mesas: plano de la sala, cuentas abiertas por mesa, rondas y cobro. Lo usan
// también los camareros (rol «Pedidos»): el layout ya exige sesión. Ver docs/MESAS.md
export default async function MesasPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return <MesasClient tenant={tenant} />;
}
