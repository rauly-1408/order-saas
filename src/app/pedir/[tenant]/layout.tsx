import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import { prisma } from "@/app/lib/prisma";
import { parseOnline } from "@/app/lib/brand";
import { brandFontsClass } from "@/app/lib/brandFonts";

// Fuentes de la carta pública: todas con next/font, servidas desde nuestro dominio.
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

export default function PedirLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${display.variable} ${brandFontsClass}`}>
      {children}
    </div>
  );
}
