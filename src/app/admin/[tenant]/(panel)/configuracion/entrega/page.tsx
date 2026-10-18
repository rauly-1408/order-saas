import SettingsSection from "../SettingsSection";
import ConfiguracionClient from "../ConfiguracionClient";
import RepartoExterno from "../RepartoExterno";

// Envío y entrega: canales, precios y tiempos (comunes a todos los locales),
// reparto con plataformas y repartidor externo.
export default async function EntregaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="entrega">
      <div className="space-y-7">
        <ConfiguracionClient tenant={tenant} />
        <RepartoExterno tenant={tenant} />
      </div>
    </SettingsSection>
  );
}
