import SettingsSection from "../SettingsSection";
import Dominios from "./Dominios";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="dominios">
      <Dominios tenant={tenant} />
    </SettingsSection>
  );
}
