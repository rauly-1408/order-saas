import type { MetadataRoute } from "next";

// robots.txt: Google puede leer las tiendas; el panel, la API y las páginas
// privadas (tarjetas regalo, colaboradores) no se indexan.
export default function robots(): MetadataRoute.Robots {
  const origin = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return {
    rules: [{ userAgent: "*", allow: "/pedir/", disallow: ["/admin/", "/api/", "/colaborador/", "/pwa/", "/pedir/*/regalo/", "/pedir/*/confirmacion/", "/pedir/*/pago/", "/pedir/*/checkout"] }],
    ...(origin && { sitemap: `${origin}/sitemap.xml` }),
  };
}
