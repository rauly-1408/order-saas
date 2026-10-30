import { requireAreaPage } from "@/app/lib/auth";
import KdsClient from "./KdsClient";

// Pantalla de cocina (KDS) a pantalla completa. Ver docs/PANTALLA-COCINA.md
export default async function CocinaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const access = await requireAreaPage(tenant, "pedidos");
  return <KdsClient tenant={tenant} station={access.station} />;
}
