import { redirect } from "next/navigation";

// Personalización pasó a Configuración → Marca (como Shopify).
export default async function PersonalizacionPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/admin/${tenant}/configuracion/marca`);
}
