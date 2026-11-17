import SettingsSection from "../SettingsSection";
import Ticket from "./Ticket";

export default async function Page({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <SettingsSection slug="ticket">
      <Ticket tenant={tenant} />
    </SettingsSection>
  );
}
