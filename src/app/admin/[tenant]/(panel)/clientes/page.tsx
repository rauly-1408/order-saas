import { requireManagerPage } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);

  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { addons: true } });
  if (!t?.addons.includes("RETENTION")) return <RetentionUpsell />;
  return <ClientesClient tenant={tenant} />;
}

// Pantalla para restaurantes que no tienen el motor de retención contratado.
function RetentionUpsell() {
  const items = [
    ["Tus clientes, tuyos", "Cada pedido guarda nombre, teléfono, gasto y frecuencia. Sin intermediarios."],
    ["Segmentos automáticos", "Nuevos, habituales, VIP y los que hace tiempo que no piden."],
    ["Campañas por WhatsApp", "Un mensaje personalizado para cada grupo, con su cupón, en un clic."],
    ["Resultados reales", "Cuántos volvieron a pedir y cuánto facturaste gracias a cada campaña."],
  ];
  return (
    <div className="mx-auto max-w-2xl text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Clientes</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Módulo opcional · no está activado en tu restaurante</p>
      <div className="mt-6 rounded-2xl bg-[var(--p-surface)] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <p className="text-lg font-semibold">Haz que tus clientes vuelvan, solos.</p>
        <ul className="mt-4 space-y-3">
          {items.map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 text-[var(--p-brand)]">✓</span>
              <span>
                <span className="font-semibold">{title}.</span> <span className="text-[var(--p-muted)]">{text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 rounded-lg bg-[var(--p-bg)] px-4 py-3 text-sm text-[var(--p-muted)]">Para activarlo, contacta con tu gestor de cuenta.</p>
      </div>
    </div>
  );
}
