import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { panelBrand } from "@/app/lib/panelTheme";

// Icono de la app del panel: inicial del restaurante sobre su color de marca.
export async function GET(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("pwa") + 1];
  const size = [180, 192, 512].includes(Number(parts[parts.length - 1])) ? Number(parts[parts.length - 1]) : 192;
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, branding: true } });
  // Con logotipo cuadrado (Personalización), el icono es ese logo.
  const square = t ? await prisma.brandAsset.findUnique({ where: { tenantId_kind: { tenantId: t.id, kind: "LOGO_SQUARE" } }, select: { data: true, mimeType: true } }) : null;
  // Se sirve tal cual (ya viene cuadrado y como mucho de 512 px, ver brand.ts):
  // ImageResponse no pinta bien todos los PNG y devolvía un icono en blanco.
  if (square && square.mimeType !== "image/webp") {
    return new Response(new Uint8Array(square.data), {
      headers: { "Content-Type": square.mimeType, "Cache-Control": "public, max-age=3600" },
    });
  }
  const brand = panelBrand(t?.branding);
  const letter = (t?.name ?? slug).charAt(0).toUpperCase();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: brand.brand,
          color: brand.warm,
          fontSize: size * 0.55,
          fontWeight: 800,
        }}
      >
        {letter}
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
