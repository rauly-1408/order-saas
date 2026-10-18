import SettingsSection from "../SettingsSection";
import Notificaciones from "./Notificaciones";

export default async function Page() {
  return (
    <SettingsSection slug="notificaciones">
      <Notificaciones />
    </SettingsSection>
  );
}
