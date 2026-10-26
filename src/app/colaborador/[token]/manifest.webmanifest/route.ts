import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { panelBrand } from "@/app/lib/panelTheme";

// Manifiesto de la app del colaborador: instalada en su móvil abre directamente
// su perfil (/colaborador/[token]) y nada más. Ver docs/COLABORADORES.md
export async function GET(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const token = parts[parts.indexOf("colaborador") + 1] ?? "";
  const c = /^[\w-]{10,64}$/.test(token) ? await prisma.collaborator.findUnique({ where: { token }, select: { name: true, tenantId: true } }) : null;
  const t = c ? await prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true, slug: true, branding: true } }) : null;
  if (!c || !t) return NextResponse.json({ error: "Enlace no válido" }, { status: 404 });
  const brand = panelBrand(t.branding);
  return NextResponse.json(
    {
      id: `/colaborador/${token}`,
      name: `${t.name} · Mis ventas`,
      short_name: "Mis ventas",
      description: `Lo que llevas ganado con ${t.name}`,
      start_url: `/colaborador/${token}`,
      scope: `/colaborador/${token}`,
      display: "standalone",
      background_color: "#f5f5f7",
      theme_color: brand.brand,
      lang: "es",
      icons: [
        { src: `/pwa/${t.slug}/icon/192`, sizes: "192x192", type: "image/png" },
        { src: `/pwa/${t.slug}/icon/512`, sizes: "512x512", type: "image/png" },
        { src: `/pwa/${t.slug}/icon/512`, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" } }
  );
}
