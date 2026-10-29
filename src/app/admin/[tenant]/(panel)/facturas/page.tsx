import { requireAreaPage } from "@/app/lib/auth";
import FacturasClient from "./FacturasClient";

// Facturas: la factura completa a nombre del cliente (empresa o autónomo) a
// partir de su ticket. La usan el gerente, el encargado y la caja.
// Ver docs/VERIFACTU.md
export default async function FacturasPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ pedido?: string; ticket?: string }> }) {
  const { tenant } = await params;
  await requireAreaPage(tenant, "facturas");
  const { pedido, ticket } = await searchParams;
  return <FacturasClient tenant={tenant} initialOrder={pedido ?? null} initialTicket={ticket ?? null} />;
}
