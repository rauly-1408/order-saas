import SettingsSection from "../SettingsSection";
import Impresoras from "./Impresoras";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="impresoras">
      <Impresoras tenant={tenant} />
    </SettingsSection>
  );
}
