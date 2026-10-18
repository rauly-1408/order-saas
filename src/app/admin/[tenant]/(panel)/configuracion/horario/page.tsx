import SettingsSection from "../SettingsSection";
import StorePicker from "../StorePicker";
import Operativa from "../Operativa";

// Horario, cierres y zonas: de cada local (con varios, se elige arriba).
export default async function HorarioPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="horario">
      <StorePicker tenant={tenant} />
      <Operativa tenant={tenant} />
    </SettingsSection>
  );
}
