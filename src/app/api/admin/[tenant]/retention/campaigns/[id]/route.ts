import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { publicMenuUrl, retentionTenant } from "@/app/lib/retentionApi";
import { couponLabel, renderMessage } from "@/app/lib/retention";
import { whatsappLink } from "@/app/lib/purchasing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function campaignId(req: NextRequest): string {
  const parts = new URL(req.url).pathname.split("/");
  return parts[parts.indexOf("campaigns") + 1];
}

// GET → campaña con cada destinatario, su mensaje personalizado y el enlace de WhatsApp
export async function GET(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId(req), tenantId: ctx.tenant.id },
    include: {
      coupon: true,
      sends: {
        orderBy: { createdAt: "asc" },
        include: { customer: { select: { name: true, phone: true, marketingConsent: true } } },
      },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaña no encontrada" }, { status: 404 });

  const enlace = publicMenuUrl(req, ctx.tenant.slug);
  const sends = campaign.sends.map((s) => {
    const message = renderMessage(campaign.messageBody, {
      nombre: s.customer.name ?? "",
      restaurante: ctx.tenant.name,
      enlace,
      cupon: campaign.coupon?.code,
      descuento: campaign.coupon ? couponLabel(campaign.coupon) : null,
    });
    return {
      id: s.id,
      status: s.status,
      sentAt: s.sentAt,
      convertedAt: s.convertedAt,
      name: s.customer.name,
      phone: s.customer.phone,
      optedOut: !s.customer.marketingConsent,
      message,
      waLink: s.customer.marketingConsent ? whatsappLink(s.customer.phone, message) : null,
    };
  });

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      targetSegment: campaign.targetSegment,
      messageBody: campaign.messageBody,
      couponCode: campaign.coupon?.code ?? null,
      createdAt: campaign.createdAt,
      sentAt: campaign.sentAt,
    },
    sends,
  });
}

// PATCH { status: "CANCELLED" } → anula la campaña y descarta los envíos pendientes
export async function PATCH(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const body = (await req.json().catch(() => null)) as { status?: unknown } | null;
  if (body?.status !== "CANCELLED") return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  const id = campaignId(req);
  const result = await prisma.campaign.updateMany({ where: { id, tenantId: ctx.tenant.id, status: { in: ["DRAFT", "SENDING"] } }, data: { status: "CANCELLED" } });
  if (result.count === 0) return NextResponse.json({ error: "Esta campaña ya no se puede anular" }, { status: 409 });
  await prisma.campaignSend.updateMany({ where: { campaignId: id, status: "PENDING" }, data: { status: "FAILED" } });
  return NextResponse.json({ ok: true });
}
