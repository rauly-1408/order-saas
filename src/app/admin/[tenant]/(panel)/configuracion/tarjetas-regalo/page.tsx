import SettingsSection from "../SettingsSection";
import TarjetasRegalo from "./TarjetasRegalo";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="tarjetas-regalo">
      <TarjetasRegalo tenant={tenant} />
    </SettingsSection>
  );
}
