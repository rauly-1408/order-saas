import SettingsSection from "../SettingsSection";
import Facturacion from "./Facturacion";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="facturacion">
      <Facturacion tenant={tenant} />
    </SettingsSection>
  );
}
