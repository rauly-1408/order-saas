import SettingsSection from "../SettingsSection";
import NegocioClient from "./NegocioClient";

export default async function NegocioPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="negocio">
      <NegocioClient tenant={tenant} />
    </SettingsSection>
  );
}
