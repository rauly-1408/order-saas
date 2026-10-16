import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { panelBrand } from "@/app/lib/panelTheme";

// Manifiesto para instalar el panel del restaurante como app (PWA).
// Instalada, la app puede sonar al entrar un pedido sin tocar antes la pantalla.
// Va fuera de /admin porque el navegador lo pide sin la cookie de sesión.
export async function GET(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("pwa") + 1];
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { name: true, branding: true } });
  if (!t) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const brand = panelBrand(t.branding);
  return NextResponse.json(
    {
      id: `/admin/${slug}/`,
      name: `${t.name} · Panel`,
      short_name: t.name,
      description: `Pedidos, carta y costes de ${t.name}`,
      start_url: `/admin/${slug}/pedidos`,
      scope: `/admin/${slug}/`,
      display: "standalone",
      background_color: brand.warm,
      theme_color: brand.brand,
      lang: "es",
      icons: [
        { src: `/pwa/${slug}/icon/192`, sizes: "192x192", type: "image/png" },
        { src: `/pwa/${slug}/icon/512`, sizes: "512x512", type: "image/png" },
        { src: `/pwa/${slug}/icon/512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } }
  );
}
