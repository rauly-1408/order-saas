import Link from "next/link";
import { headers } from "next/headers";
import { requireManagerPage } from "@/app/lib/auth";
import { prisma } from "@/app/lib/prisma";
import ConfigNav from "./ConfigNav";

// Configuración a pantalla completa, como Shopify: sin la barra lateral del
// panel (se oculta en esta ruta), con su cabecera y «✕» para salir, y el menú
// de apartados a la izquierda (en el móvil, como portada).
export default async function ConfiguracionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  await requireManagerPage(tenant);
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { name: true, branding: true, domains: true } });
  const branding = (t?.branding ?? {}) as Record<string, unknown>;
  const logoUrl = (branding.logoSquareUrl as string) || (branding.logoUrl as string) || null;
  const h = await headers();
  const storeUrl = t?.domains[0] ? `https://${t.domains[0]}` : `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? ""}/pedir/${tenant}`;
  return (
    <div className="-mt-20 lg:-mt-10">
      <header className="sticky -top-20 z-20 -mx-4 flex lg:-top-10 items-center gap-3 border-b border-[var(--p-line)] bg-[var(--p-bg)]/90 px-4 py-3 backdrop-blur lg:-mx-10 lg:px-10">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden className="text-[var(--p-muted)]">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
          <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
        </svg>
        <h1 className="flex-1 text-[15px] font-semibold">Configuración</h1>
        <Link href={`/admin/${tenant}/home`} aria-label="Cerrar configuración" className="p-press flex h-9 w-9 items-center justify-center rounded-full text-lg text-[var(--p-muted)] hover:bg-black/[0.05]">
          ✕
        </Link>
      </header>
      <div className="mt-6 lg:grid lg:grid-cols-[270px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <ConfigNav tenant={tenant} name={t?.name ?? tenant} logoUrl={logoUrl} storeUrl={storeUrl} />
        <div className="min-w-0 max-w-3xl">{children}</div>
      </div>
    </div>
  );
}
