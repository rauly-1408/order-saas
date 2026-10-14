import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { parseCampaign, retentionTenant } from "@/app/lib/retentionApi";
import { computeSegment } from "@/app/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nadie recibe más de una campaña por semana.
const FREQUENCY_CAP_DAYS = 7;

// POST /api/admin/[tenant]/retention/campaigns → crea la campaña y su lista de envíos
export async function POST(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  const input = parseCampaign(await req.json().catch(() => null));
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const tenantId = ctx.tenant.id;

  if (input.couponId) {
    const coupon = await prisma.coupon.findFirst({ where: { id: input.couponId, tenantId, active: true }, select: { id: true } });
    if (!coupon) return NextResponse.json({ error: "El cupón elegido no existe o está desactivado" }, { status: 400 });
  }

  // Destinatarios: solo con consentimiento de marketing (RGPD) y del segmento
  // elegido según su historial a fecha de hoy.
  const now = new Date();
  const candidates = await prisma.customer.findMany({
    where: { tenantId, marketingConsent: true },
    select: { id: true, ordersCount: true, totalSpentCents: true, lastOrderAt: true },
  });
  const inSegment = candidates.filter((c) => computeSegment(c.ordersCount, c.totalSpentCents, c.lastOrderAt, now) === input.targetSegment);

  const capSince = new Date(now.getTime() - FREQUENCY_CAP_DAYS * 86_400_000);
  const recent = await prisma.campaignSend.findMany({
    where: {
      customerId: { in: inSegment.map((c) => c.id) },
      // Enviado esta semana, o pendiente en otra campaña que sigue en marcha
      OR: [{ sentAt: { gte: capSince } }, { status: "PENDING", campaign: { status: "SENDING" } }],
    },
    select: { customerId: true },
  });
  const recentlyMessaged = new Set(recent.map((r) => r.customerId));
  const recipients = inSegment.filter((c) => !recentlyMessaged.has(c.id));

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error: inSegment.length
          ? "Todos los clientes de este grupo recibieron un mensaje esta semana. Prueba dentro de unos días."
          : "No hay clientes de este grupo que hayan aceptado recibir ofertas.",
      },
      { status: 400 }
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      tenantId,
      name: input.name,
      channel: "WHATSAPP",
      targetSegment: input.targetSegment,
      messageBody: input.messageBody,
      couponId: input.couponId,
      status: "SENDING",
      recipientsCount: recipients.length,
      sends: { create: recipients.map((c) => ({ customerId: c.id })) },
    },
    select: { id: true },
  });

  return NextResponse.json({ campaign, recipients: recipients.length, skipped: recentlyMessaged.size }, { status: 201 });
}
