import SettingsSection from "../SettingsSection";
import PersonalizacionClient from "../../personalizacion/PersonalizacionClient";

// Marca (antes «Personalización»): logotipos, colores, fuentes y presencia online.
export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="marca">
      <PersonalizacionClient tenant={tenant} embedded />
    </SettingsSection>
  );
}
