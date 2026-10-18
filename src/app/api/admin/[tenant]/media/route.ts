import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { sniffImage } from "@/app/lib/brand";
import { imageUrl, isBlobUrl, MAX_IMAGE_BYTES, videoStorageEnabled, type MediaItem } from "@/app/lib/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Panel → Archivos: biblioteca de imágenes y vídeos del restaurante.
async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

const select = { id: true, kind: true, name: true, mimeType: true, size: true, width: true, height: true, url: true, createdAt: true } as const;
type Row = { id: string; kind: string; name: string; mimeType: string; size: number; width: number; height: number; url: string | null; createdAt: Date };
const toItem = (slug: string, f: Row): MediaItem => ({ ...f, kind: f.kind as MediaItem["kind"], url: f.url ?? imageUrl(slug, f.id), createdAt: f.createdAt.toISOString() });

// GET ?kind=IMAGE|VIDEO → archivos (sin el contenido).
export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const kind = new URL(req.url).searchParams.get("kind") === "VIDEO" ? "VIDEO" : "IMAGE";
  const files = await prisma.mediaFile.findMany({ where: { tenantId: c.tenant.id, kind }, orderBy: { createdAt: "desc" }, take: 500, select });
  // Dónde se usa cada imagen (fotos de productos), para avisar antes de borrar.
  const used = kind === "IMAGE" ? await prisma.product.findMany({ where: { tenantId: c.tenant.id, imageUrl: { startsWith: `/api/media/${c.tenant.slug}/` } }, select: { name: true, imageUrl: true } }) : [];
  return NextResponse.json({
    files: files.map((f) => ({ ...toItem(c.tenant.slug, f), usedBy: used.filter((p) => p.imageUrl === imageUrl(c.tenant.slug, f.id)).map((p) => p.name) })),
    videoEnabled: videoStorageEnabled(),
  });
}

// POST → sube una imagen (cuerpo = bytes ya comprimidos en el navegador).
// Cabeceras: X-File-Name (codificado), X-Image-Width, X-Image-Height.
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return NextResponse.json({ error: "No se ha recibido ninguna imagen" }, { status: 400 });
  if (bytes.length > MAX_IMAGE_BYTES) return NextResponse.json({ error: "La imagen pesa demasiado (máx. 1,5 MB)" }, { status: 413 });
  const mimeType = sniffImage(bytes);
  if (!mimeType) return NextResponse.json({ error: "Formato no válido: usa PNG, JPG o WebP" }, { status: 415 });
  const count = await prisma.mediaFile.count({ where: { tenantId: c.tenant.id } });
  if (count >= 2000) return NextResponse.json({ error: "Has llegado al máximo de 2.000 archivos" }, { status: 400 });
  const dim = (h: string) => Math.min(Math.max(Number(req.headers.get(h)) || 0, 0), 10_000);
  let name = "imagen";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") ?? "imagen").slice(0, 120) || "imagen";
  } catch {}
  const file = await prisma.mediaFile.create({
    data: { tenantId: c.tenant.id, kind: "IMAGE", name, mimeType, size: bytes.length, width: dim("x-image-width"), height: dim("x-image-height"), data: Buffer.from(bytes) },
    select,
  });
  return NextResponse.json({ file: toItem(c.tenant.slug, file) });
}

// DELETE ?id= → borra el archivo (el vídeo también del almacén de Vercel).
export async function DELETE(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const file = await prisma.mediaFile.findFirst({ where: { id, tenantId: c.tenant.id }, select: { id: true, url: true } });
  if (!file) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
  if (file.url && isBlobUrl(file.url) && videoStorageEnabled()) {
    try {
      await del(file.url);
    } catch (err) {
      console.error("[media delete blob]", err);
    }
  }
  await prisma.mediaFile.delete({ where: { id: file.id } });
  return NextResponse.json({ ok: true });
}
