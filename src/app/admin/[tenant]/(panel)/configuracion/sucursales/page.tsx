import SettingsSection from "../SettingsSection";
import Sucursales from "./Sucursales";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="sucursales">
      <Sucursales tenant={tenant} />
    </SettingsSection>
  );
}
