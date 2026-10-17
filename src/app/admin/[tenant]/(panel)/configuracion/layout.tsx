import { requireManagerPage } from "@/app/lib/auth";
import ConfigNav from "./ConfigNav";

// Configuración por apartados, como Shopify: menú a la izquierda (arriba en el
// móvil) y cada apartado en su propia página.
export default async function ConfiguracionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  return (
    <div>
      <h1 className="text-[34px] font-semibold tracking-tight">Configuración</h1>
      <p className="mt-1 text-[13px] text-[var(--p-faint)]">Los ajustes de tu restaurante, por apartados</p>
      <div className="mt-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <ConfigNav tenant={tenant} />
        <div className="min-w-0 max-w-3xl">{children}</div>
      </div>
    </div>
  );
}
