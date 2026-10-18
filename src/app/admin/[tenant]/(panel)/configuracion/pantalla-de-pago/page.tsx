import SettingsSection from "../SettingsSection";
import PantallaPago from "./PantallaPago";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="pantalla-de-pago">
      <PantallaPago tenant={tenant} />
    </SettingsSection>
  );
}
