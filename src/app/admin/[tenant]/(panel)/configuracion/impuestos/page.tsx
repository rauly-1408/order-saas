import SettingsSection from "../SettingsSection";
import Impuestos from "./Impuestos";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="impuestos">
      <Impuestos tenant={tenant} />
    </SettingsSection>
  );
}
