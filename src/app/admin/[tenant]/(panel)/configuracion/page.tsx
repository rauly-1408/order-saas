import SettingsSection from "./SettingsSection";
import NegocioClient from "./negocio/NegocioClient";

// Portada de Configuración: en el móvil se ve solo la lista de apartados (la
// pinta el layout); en el ordenador, como Shopify, abre «Información del negocio».
export default async function ConfiguracionPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <div className="hidden lg:block">
      <SettingsSection slug="negocio">
        <NegocioClient tenant={tenant} />
      </SettingsSection>
    </div>
  );
}
