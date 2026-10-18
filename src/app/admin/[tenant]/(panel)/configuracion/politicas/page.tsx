import SettingsSection from "../SettingsSection";
import Politicas from "./Politicas";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="politicas">
      <Politicas tenant={tenant} />
    </SettingsSection>
  );
}
