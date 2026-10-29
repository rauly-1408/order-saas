import SettingsSection from "../SettingsSection";
import Integraciones from "./Integraciones";

// Integraciones: todo lo que el restaurante conecta con NorApp, en un sitio.
// Ver docs/INTEGRACIONES.md
export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="integraciones">
      <Integraciones tenant={tenant} />
    </SettingsSection>
  );
}
