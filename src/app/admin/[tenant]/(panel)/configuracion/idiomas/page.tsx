import SettingsSection from "../SettingsSection";
import Idiomas from "./Idiomas";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="idiomas">
      <Idiomas tenant={tenant} />
    </SettingsSection>
  );
}
