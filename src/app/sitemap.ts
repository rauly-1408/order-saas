import type { MetadataRoute } from "next";
import { prisma } from "@/app/lib/prisma";

// sitemap.xml: la tienda de cada restaurante (y sus páginas legales), para que
// Google las encuentre antes. Ver docs/MARCA-NORAPP.md
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  // Sin el restaurante de demostración: es para enseñar NorApp, no para Google.
  const tenants = await prisma.tenant.findMany({ where: { slug: { not: "demo" } }, select: { slug: true, updatedAt: true } });
  return tenants.map((t) => ({ url: `${origin}/pedir/${t.slug}`, lastModified: t.updatedAt, changeFrequency: "daily" as const, priority: 1 }));
}
