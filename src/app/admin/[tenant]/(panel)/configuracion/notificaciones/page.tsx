import SettingsSection from "../SettingsSection";
import Notificaciones from "./Notificaciones";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="notificaciones">
      <Notificaciones tenant={tenant} />
    </SettingsSection>
  );
}
