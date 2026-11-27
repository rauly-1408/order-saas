import SettingsSection from "../SettingsSection";
import ConfiguracionClient from "../ConfiguracionClient";
import RepartoExterno from "../RepartoExterno";
import Repartidores from "../Repartidores";

// Envío y entrega: canales, precios, repartidores propios y reparto externo.
export default async function EntregaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="entrega">
      <div className="space-y-7">
        <ConfiguracionClient tenant={tenant} />
        <Repartidores tenant={tenant} />
        <RepartoExterno tenant={tenant} />
      </div>
    </SettingsSection>
  );
}
