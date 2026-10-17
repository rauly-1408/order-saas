import ConfiguracionClient from "../ConfiguracionClient";
import RepartoExterno from "../RepartoExterno";

// Envío y entrega: canales, precios y tiempos, reparto con plataformas y repartidor externo.
export default async function EntregaPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  return (
    <div className="space-y-7">
      <ConfiguracionClient tenant={tenant} />
      <RepartoExterno tenant={tenant} />
    </div>
  );
}
