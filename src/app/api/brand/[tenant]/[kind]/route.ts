import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { assetKindFromSlug } from "@/app/lib/brand";

export const runtime = "nodejs";

// GET /api/brand/[tenant]/[kind]?v=… → imagen de marca (pública: logo, favicon…).
// Con ?v= la respuesta es inmutable; al subir otra imagen cambia la versión.
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenant: string; kind: string }> }) {
  const { tenant, kind: kindSlug } = await params;
  const kind = assetKindFromSlug(kindSlug);
  if (!kind) return new Response("No encontrado", { status: 404 });
  const asset = await prisma.brandAsset.findFirst({
    where: { kind, tenant: { slug: tenant } },
    select: { data: true, mimeType: true },
  });
  if (!asset) return new Response("No encontrado", { status: 404 });
  const versioned = new URL(req.url).searchParams.has("v");
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mimeType,
      "Cache-Control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
