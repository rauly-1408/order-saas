import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { applyCourierPatch, courierAccount } from "@/app/lib/couriers";
import { fromGlovo, verifyGlovoSignature } from "@/app/lib/couriers/glovo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Avisos de Glovo On-Demand con cada cambio del viaje. Solo se aceptan si la
// firma HMAC (X-Signature-SHA256) cuadra con el secreto del restaurante.
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const raw = await req.text();
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const account = await courierAccount(tenant.id);
  if (!account || !verifyGlovoSignature(raw, req.headers.get("x-signature-sha256"), account.ctx.secrets.webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const patch = fromGlovo(body);
  if (!patch.externalId) return NextResponse.json({ ok: true });
  const delivery = await prisma.courierDelivery.findFirst({ where: { tenantId: tenant.id, provider: "GLOVO", externalId: patch.externalId } });
  // Viaje desconocido: se responde 200 para que Glovo no reintente.
  if (delivery) await applyCourierPatch(delivery, patch);
  return NextResponse.json({ ok: true });
}
