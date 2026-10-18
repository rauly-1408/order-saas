import SettingsSection from "../SettingsSection";
import Plan from "./Plan";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="plan">
      <Plan tenant={tenant} />
    </SettingsSection>
  );
}
