import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import { prisma } from "@/app/lib/prisma";
import { googleFontsHref, parseOnline } from "@/app/lib/brand";

// Fuentes de la carta pública: Inter y Anton van con next/font; el resto de las
// que ofrece Personalización se piden a Google Fonts según la marca del restaurante.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Anton({ subsets: ["latin"], weight: "400", variable: "--font-display", display: "swap" });

async function brandingOf(slug: string) {
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { name: true, branding: true } });
  return t ? { name: t.name, branding: (t.branding ?? {}) as Record<string, unknown> } : null;
}

// Favicon, título y descripción para Google y al compartir el enlace (Presencia online).
export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }): Promise<Metadata> {
  const { tenant } = await params;
  const t = await brandingOf(tenant);
  if (!t) return {};
  const online = parseOnline(t.branding.online);
  const title = online.seoTitle ?? `${t.name} · Pedidos online`;
  const description = online.seoDescription ?? `Pide online en ${t.name}: a domicilio o para recoger.`;
  const favicon = typeof t.branding.faviconUrl === "string" ? t.branding.faviconUrl : null;
  const hero = typeof t.branding.heroImageUrl === "string" ? t.branding.heroImageUrl : null;
  return {
    title: { absolute: title },
    description,
    ...(favicon && { icons: { icon: favicon, apple: favicon } }),
    openGraph: { title, description, type: "website", ...(hero && { images: [hero] }) },
  };
}

export default async function PedirLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const t = await brandingOf(tenant);
  const href = t ? googleFontsHref([t.branding.headingFontName as string, t.branding.bodyFontName as string]) : null;
  return (
    <div className={`${inter.variable} ${display.variable}`}>
      {href && (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link rel="stylesheet" href={href} />
        </>
      )}
      {children}
    </div>
  );
}
