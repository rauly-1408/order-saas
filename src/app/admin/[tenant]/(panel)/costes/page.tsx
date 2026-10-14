import { requireManagerPage } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import CostesClient from "./CostesClient";

export default async function CostesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);

  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { addons: true } });
  if (!t?.addons.includes("COSTS")) return <CostesUpsell />;
  return <CostesClient tenant={tenant} />;
}

// Pantalla para restaurantes que no tienen el módulo contratado.
function CostesUpsell() {
  const items = [
    ["Escandallos", "Coste exacto de cada plato, incluido el pan, la guarnición y cada extra."],
    ["Margen real", "Lo que ganas en cada pedido, descontando ingredientes y comisiones."],
    ["Precio sugerido", "El precio que necesitas para alcanzar tu margen objetivo."],
    ["Alérgenos", "Los 14 alérgenos obligatorios, ligados a tus ingredientes."],
  ];
  return (
    <div className="mx-auto max-w-2xl text-[#393659]">
      <h1 className="text-2xl font-bold">Costes y margen</h1>
      <p className="mt-1 text-sm text-[#6b6890]">Módulo opcional · no está activado en tu restaurante</p>
      <div className="mt-6 rounded-xl border border-[#eaeaf4] bg-white p-6">
        <p className="text-lg font-semibold">Sabe cuánto ganas en cada plato y en cada pedido.</p>
        <ul className="mt-4 space-y-3">
          {items.map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 text-[#7939fe]">✓</span>
              <span>
                <span className="font-semibold">{title}.</span> <span className="text-[#6b6890]">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 rounded-lg bg-[#f7f7fb] px-4 py-3 text-sm text-[#6b6890]">
          Para activarlo, contacta con tu gestor de cuenta.
        </p>
      </div>
    </div>
  );
}
