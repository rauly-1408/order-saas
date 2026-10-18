import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { isBlobUrl, MAX_VIDEO_BYTES, VIDEO_TYPES, videoStorageEnabled } from "@/app/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vídeos (panel → Archivos → Vídeos). El navegador los sube directamente a
// Vercel Blob (sin pasar por el servidor, que no admite cuerpos grandes):
// 1) este endpoint le da un permiso de subida limitado a su carpeta, tipo y tamaño;
// 2) al terminar, el navegador avisa con { action: "register" } y se guarda aquí.
export async function POST(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  if (!videoStorageEnabled()) return NextResponse.json({ error: "El almacén de vídeos no está activado" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as (HandleUploadBody & { action?: string }) | { action: "register"; url?: string; pathname?: string; name?: string; size?: number; mimeType?: string } | null;
  if (!body) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });
  const folder = `tenants/${tenant.slug}/videos/`;

  if ("action" in body && body.action === "register") {
    const b = body as { url?: string; pathname?: string; name?: string; size?: number; mimeType?: string };
    if (!b.url || !isBlobUrl(b.url) || !b.pathname?.startsWith(folder) || !new URL(b.url).pathname.includes(`/${folder}`)) {
      return NextResponse.json({ error: "Vídeo no válido" }, { status: 400 });
    }
    const mimeType = VIDEO_TYPES.includes(b.mimeType ?? "") ? b.mimeType! : "video/mp4";
    const file = await prisma.mediaFile.create({
      data: { tenantId: tenant.id, kind: "VIDEO", name: (b.name ?? "vídeo").slice(0, 120), mimeType, size: Math.min(Math.max(Number(b.size) || 0, 0), MAX_VIDEO_BYTES), url: b.url },
      select: { id: true },
    });
    return NextResponse.json({ id: file.id });
  }

  try {
    const json = await handleUpload({
      body: body as HandleUploadBody,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(folder)) throw new Error("Carpeta no válida");
        return { allowedContentTypes: VIDEO_TYPES, maximumSizeInBytes: MAX_VIDEO_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "No se pudo preparar la subida" }, { status: 400 });
  }
}
