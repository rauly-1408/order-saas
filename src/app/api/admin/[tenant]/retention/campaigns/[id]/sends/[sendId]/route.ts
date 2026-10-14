import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH { status: "SENT" | "PENDING" } → marca un mensaje como enviado (o lo deshace).
// Con el envío manual por WhatsApp, el dueño abre el chat y lo marca aquí.
export async function PATCH(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const parts = new URL(req.url).pathname.split("/");
  const campaignId = parts[parts.indexOf("campaigns") + 1];
  const sendId = parts[parts.length - 1];
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  if (body?.status !== "SENT" && body?.status !== "PENDING") return NextResponse.json({ error: "Estado no válido" }, { status: 400 });

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, tenantId: ctx.tenant.id }, select: { id: true, status: true } });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });
  if (campaign.status === "CANCELLED") return NextResponse.json({ error: "La campaña está anulada" }, { status: 409 });

  // Un envío convertido no vuelve atrás; uno a un cliente dado de baja no se envía.
  const from = body.status === "SENT" ? "PENDING" : "SENT";
  const result = await prisma.campaignSend.updateMany({
    where: { id: sendId, campaignId, status: from, ...(body.status === "SENT" && { customer: { marketingConsent: true } }) },
    data: { status: body.status, sentAt: body.status === "SENT" ? new Date() : null },
  });
  if (result.count === 0) return NextResponse.json({ error: "Este mensaje no se puede cambiar" }, { status: 409 });

  // La campaña queda enviada cuando no le quedan mensajes pendientes.
  const pending = await prisma.campaignSend.count({ where: { campaignId, status: "PENDING" } });
  await prisma.campaign.update({
    where: { id: campaignId },
    data: pending === 0 ? { status: "SENT", sentAt: new Date() } : { status: "SENDING" },
  });
  return NextResponse.json({ ok: true, pending });
}
