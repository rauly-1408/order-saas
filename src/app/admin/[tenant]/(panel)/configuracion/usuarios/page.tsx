import SettingsSection from "../SettingsSection";
import Usuarios from "./Usuarios";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="usuarios">
      <Usuarios tenant={tenant} />
    </SettingsSection>
  );
}
