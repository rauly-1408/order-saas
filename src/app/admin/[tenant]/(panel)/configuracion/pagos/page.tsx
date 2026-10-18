import SettingsSection from "../SettingsSection";
import Pagos from "./Pagos";

export default async function PagosPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="pagos">
      <Pagos tenant={tenant} />
    </SettingsSection>
  );
}
