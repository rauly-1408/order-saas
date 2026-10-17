import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { paymentAccount, refundOrder, verifyPayment } from "@/app/lib/gateways";
import { verifyStripeSignature } from "@/app/lib/gateways/stripe";
import { redsysVerify } from "@/app/lib/gateways/redsys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Avisos de la pasarela del restaurante: Redsys (formulario firmado) o Stripe
// (JSON con cabecera Stripe-Signature). Solo se fían de su firma. Ver docs/PAGOS.md
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const account = await paymentAccount(tenant.id);
  const raw = await req.text();

  if (account.provider === "STRIPE") {
    if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), account.ctx.secrets.webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    const event = JSON.parse(raw) as { type?: string; data?: { object?: { metadata?: Record<string, string> } } };
    const orderId = event.data?.object?.metadata?.orderId;
    if (orderId && event.type?.startsWith("checkout.session.")) await settle(tenant.id, orderId, {});
    return NextResponse.json({ received: true });
  }

  if (account.provider === "REDSYS") {
    const form = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
    const data = redsysVerify(account.ctx.secrets.secretKey ?? "", form);
    if (!data) return new NextResponse("KO", { status: 400 });
    const dsOrder = data.Ds_Order ?? data.DS_ORDER;
    const order = await prisma.order.findFirst({ where: { tenantId: tenant.id, paymentProvider: "REDSYS", paymentRef: dsOrder }, select: { id: true } });
    if (order) await settle(tenant.id, order.id, form);
    return new NextResponse("OK");
  }

  return NextResponse.json({ error: "Sin pasarela" }, { status: 404 });
}

// Confirma el pago. Si llega pagado un pedido que ya se había dado por
// abandonado, se devuelve el dinero para no cobrar algo que no se prepara.
async function settle(tenantId: string, orderId: string, params: Record<string, string>) {
  const before = await prisma.order.findFirst({ where: { id: orderId, tenantId }, select: { status: true, paymentStatus: true } });
  if (!before) return;
  if (before.status === "AWAITING_PAYMENT") {
    await verifyPayment(orderId, params);
    return;
  }
  if (before.status === "CANCELLED" && before.paymentStatus === "FAILED" && params.Ds_MerchantParameters) {
    const data = JSON.parse(Buffer.from(params.Ds_MerchantParameters.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, string>;
    const code = Number(data.Ds_Response);
    if (code >= 0 && code <= 99) {
      await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "PAID" } });
      const err = await refundOrder(orderId);
      if (err) console.error("[payments webhook] pago tardío sin devolver", orderId, err);
    }
  }
}
