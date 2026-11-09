import SettingsSection from "../SettingsSection";
import Reservas from "./Reservas";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="reservas">
      <Reservas tenant={tenant} />
    </SettingsSection>
  );
}
