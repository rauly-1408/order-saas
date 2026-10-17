import { notFound, redirect } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { finalizePayment, verifyPayment } from "@/app/lib/gateways";
import { ui } from "@/app/lib/i18n";
import { PaymentShell, paymentShellData } from "../../PaymentShell";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

// El cliente vuelve aquí desde la pasarela. Se comprueba el pago con la propia
// pasarela (nunca con lo que diga la URL sin firmar) y se le lleva a la
// confirmación o se le explica que no se ha cobrado.
export default async function PagoVuelta({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string; orderId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tenant, orderId } = await params;
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, (Array.isArray(v) ? v[0] : v) ?? ""]));

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, paymentStatus: true, paymentProvider: true, tenant: { select: { slug: true } } } });
  if (!order || order.tenant.slug !== tenant) notFound();

  let status = order.status;
  let paymentStatus = order.paymentStatus;
  if (status === "AWAITING_PAYMENT") {
    // «Volver» en la página de Stripe: el cliente no ha pagado.
    const after = flat.cancelled === "1" && order.paymentProvider === "STRIPE" ? await finalizePayment(orderId, { status: "FAILED" }) : await verifyPayment(orderId, flat);
    status = after?.status ?? status;
    paymentStatus = after?.paymentStatus ?? paymentStatus;
  }
  if (status !== "AWAITING_PAYMENT" && !(status === "CANCELLED" && paymentStatus === "FAILED")) {
    redirect(`/pedir/${tenant}/confirmacion/${orderId}?pagado=1`);
  }

  const { tenant: t, lang, cssVars } = await paymentShellData(tenant);
  const T = ui(lang);
  const failed = status === "CANCELLED";
  return (
    <PaymentShell name={t?.name ?? tenant} cssVars={cssVars}>
      {failed ? (
        <>
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-1)] text-3xl" aria-hidden>
            ✕
          </div>
          <h1 className="text-2xl font-bold">{T.paymentFailed}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{T.paymentFailedHelp}</p>
          <a href={`/pedir/${tenant}/checkout`} className="p-press mt-6 inline-block rounded-full bg-[var(--brand-accent)] px-7 py-3 text-[15px] font-bold text-[var(--on-accent)]">
            {T.tryAgain}
          </a>
        </>
      ) : (
        <>
          <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-[var(--border)] border-t-[var(--brand-accent)]" aria-hidden />
          <h1 className="text-2xl font-bold">{T.confirmingPayment}</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{T.confirmingHelp}</p>
          <AutoRefresh />
        </>
      )}
    </PaymentShell>
  );
}
