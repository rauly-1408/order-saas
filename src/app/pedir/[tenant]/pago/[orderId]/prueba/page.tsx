import { notFound, redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { testToken } from "@/app/lib/gateways/test";
import { formatEuros, ui } from "@/app/lib/i18n";
import { PaymentShell, paymentShellData } from "../../PaymentShell";

export const dynamic = "force-dynamic";

// Pasarela de prueba: no cobra nada. Sirve para probar el flujo de pago
// completo antes de conectar Stripe o Redsys.
export default async function PagoPrueba({ params }: { params: Promise<{ tenant: string; orderId: string }> }) {
  const { tenant, orderId } = await params;
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, totalCents: true, orderNumber: true, paymentProvider: true, tenant: { select: { slug: true } } } });
  if (!order || order.tenant.slug !== tenant || order.paymentProvider !== "TEST") notFound();
  if (order.status !== "AWAITING_PAYMENT") redirect(`/pedir/${tenant}/pago/${orderId}/vuelta`);

  const { tenant: t, lang, cssVars } = await paymentShellData(tenant);
  const T = ui(lang);
  const back = (result: "ok" | "ko") => `/pedir/${tenant}/pago/${orderId}/vuelta?result=${result}&token=${testToken(orderId, result)}`;
  return (
    <PaymentShell name={t?.name ?? tenant} cssVars={cssVars}>
      <p className="mb-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{T.testPaymentTitle}</p>
      <h1 className="text-4xl font-bold tabular-nums">{formatEuros(order.totalCents)}</h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">{T.testPaymentHelp}</p>
      <div className="mt-7 grid gap-3">
        <a href={back("ok")} className="p-press rounded-full bg-[var(--brand-accent)] px-7 py-3 text-[15px] font-bold text-[var(--on-accent)]">
          ✓ {T.testPayOk}
        </a>
        <a href={back("ko")} className="p-press rounded-full border border-[var(--border)] px-7 py-3 text-[15px] font-semibold">
          ✕ {T.testPayKo}
        </a>
      </div>
    </PaymentShell>
  );
}
