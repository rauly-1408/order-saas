import { redirect } from "next/navigation";

// /configuracion abre el primer apartado.
export default async function ConfiguracionPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  redirect(`/admin/${tenant}/configuracion/negocio`);
}
