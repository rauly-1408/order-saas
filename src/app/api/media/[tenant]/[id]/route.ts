import { NextRequest } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

// GET /api/media/[tenant]/[id] → imagen de la biblioteca (pública: fotos de la
// carta). El id no cambia nunca, así que se puede guardar en caché para siempre.
// Los vídeos redirigen a su dirección en Vercel Blob.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const file = await prisma.mediaFile.findFirst({ where: { id, tenant: { slug: tenant } }, select: { data: true, mimeType: true, url: true } });
  if (!file) return new Response("No encontrado", { status: 404 });
  if (file.url) return Response.redirect(file.url, 302);
  if (!file.data) return new Response("No encontrado", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: { "Content-Type": file.mimeType, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
