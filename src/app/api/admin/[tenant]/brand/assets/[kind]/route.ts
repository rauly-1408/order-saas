import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { ASSETS, assetKindFromSlug, MAX_ASSET_BYTES, sniffImage } from "@/app/lib/brand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function context(req: NextRequest, kindSlug: string) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const kind = assetKindFromSlug(kindSlug);
  if (!kind) return { error: NextResponse.json({ error: "Tipo de imagen no válido" }, { status: 400 }) };
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, branding: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant, kind };
}

// PUT → sube la imagen (cuerpo = bytes ya comprimidos en el navegador).
// Cabeceras X-Image-Width / X-Image-Height con sus medidas.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await context(req, (await params).kind);
  if ("error" in ctx) return ctx.error;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) return NextResponse.json({ error: "No se ha recibido ninguna imagen" }, { status: 400 });
  if (bytes.length > MAX_ASSET_BYTES) return NextResponse.json({ error: "La imagen pesa demasiado (máx. 1,5 MB)" }, { status: 413 });
  const mimeType = sniffImage(bytes);
  if (!mimeType) return NextResponse.json({ error: "Formato no válido: usa PNG, JPG o WebP" }, { status: 415 });
  const dim = (h: string) => Math.min(Math.max(Number(req.headers.get(h)) || 0, 0), 10_000);
  const data = { mimeType, data: Buffer.from(bytes), width: dim("x-image-width"), height: dim("x-image-height") };

  const asset = await prisma.brandAsset.upsert({
    where: { tenantId_kind: { tenantId: ctx.tenant.id, kind: ctx.kind } },
    create: { tenantId: ctx.tenant.id, kind: ctx.kind, ...data },
    update: data,
    select: { updatedAt: true },
  });
  // La URL lleva la versión: los navegadores pueden guardarla en caché para siempre.
  const url = `/api/brand/${ctx.tenant.slug}/${ASSETS[ctx.kind].slug}?v=${asset.updatedAt.getTime()}`;
  const branding = { ...((ctx.tenant.branding as Record<string, unknown>) ?? {}), [ASSETS[ctx.kind].brandingKey]: url };
  await prisma.tenant.update({ where: { id: ctx.tenant.id }, data: { branding: branding as object } });
  return NextResponse.json({ url });
}

// DELETE → quita la imagen.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await context(req, (await params).kind);
  if ("error" in ctx) return ctx.error;
  await prisma.brandAsset.deleteMany({ where: { tenantId: ctx.tenant.id, kind: ctx.kind } });
  const branding = { ...((ctx.tenant.branding as Record<string, unknown>) ?? {}), [ASSETS[ctx.kind].brandingKey]: null };
  await prisma.tenant.update({ where: { id: ctx.tenant.id }, data: { branding: branding as object } });
  return NextResponse.json({ ok: true });
}
