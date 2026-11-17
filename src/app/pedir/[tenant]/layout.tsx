import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import { headers } from "next/headers";
import { prisma } from "@/app/lib/prisma";
import { parseOnline } from "@/app/lib/brand";
import { brandFontsClass } from "@/app/lib/brandFonts";
import { tenantIcons } from "@/app/lib/tenantIcons";

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
  const hero = typeof t.branding.heroImageUrl === "string" ? t.branding.heroImageUrl : null;
  // Imagen al compartir: la elegida en Presencia online o, si no, la de cabecera.
  const image = online.shareImageUrl ?? hero;
  // Las imágenes de Archivos son rutas propias (/api/…): al compartir hacen falta con el dominio delante.
  const h = await headers();
  const host = h.get("host");
  return {
    ...(host && { metadataBase: new URL(`${h.get("x-forwarded-proto") ?? "https"}://${host}`) }),
    title: { absolute: title },
    description,
    ...(tenantIcons(t.branding) && { icons: tenantIcons(t.branding) }),
    openGraph: { title, description, type: "website", siteName: t.name, locale: "es_ES", ...(image && { images: [image] }) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image && { images: [image] }) },
    ...(online.googleVerification && { verification: { google: online.googleVerification } }),
  };
}

export default function PedirLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${inter.variable} ${display.variable} ${brandFontsClass}`}>
      {children}
    </div>
  );
}
