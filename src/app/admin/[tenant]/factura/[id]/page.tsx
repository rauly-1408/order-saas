import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/app/lib/prisma";
import { getSession } from "@/app/lib/auth";
import { emailConfigured, euros } from "@/app/lib/email";
import { loadInvoiceDoc } from "@/app/lib/invoiceDoc";
import InvoiceActions from "./InvoiceActions";

// Factura completa a nombre del cliente, en A4 para imprimir o guardar en PDF.
// Fuera del panel (sin menú) para que salga limpia; exige sesión del restaurante.
// Ver docs/VERIFACTU.md

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Factura", robots: { index: false, follow: false } };

export default async function FacturaPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const session = await getSession();
  if (!session) redirect(`/admin/${tenant}/login`);
  const t = await prisma.tenant.findUnique({ where: { slug: tenant }, select: { id: true } });
  if (!t || (session.role !== "SUPERADMIN" && session.tenantId !== t.id)) redirect(`/admin/${tenant}/login`);
  const doc = await loadInvoiceDoc(t.id, id);
  if (!doc) notFound();
  const qr = await QRCode.toString(doc.qrUrl, { type: "svg", errorCorrectionLevel: "M", margin: 0, width: 110 });
  const th = "py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500";
  const td = "border-t border-neutral-200 py-2";

  return (
    <main className="min-h-screen bg-neutral-100 px-4 py-6 text-neutral-900 print:bg-white print:p-0">
      <InvoiceActions tenant={tenant} id={doc.id} canEmail={emailConfigured()} />
      <article className="mx-auto max-w-[210mm] rounded-2xl bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-2xl font-bold">Factura</p>
            <p className="mt-1 text-sm">
              Nº <span className="font-semibold">{doc.numSerie}</span>
            </p>
            <p className="text-sm">Fecha de expedición: {doc.issueDate}</p>
            {doc.operationDate !== doc.issueDate && <p className="text-sm">Fecha de la operación: {doc.operationDate}</p>}
            {doc.substitutes && <p className="mt-1 text-xs text-neutral-600">Sustituye a la factura simplificada {doc.substitutes}</p>}
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-semibold">{doc.issuer.name}</p>
            <p>NIF {doc.issuer.nif}</p>
            {doc.issuer.address && <p className="max-w-[260px] sm:ml-auto">{doc.issuer.address}</p>}
          </div>
        </header>

        <section className="mt-8 rounded-xl bg-neutral-50 p-4 text-sm print:border print:border-neutral-300 print:bg-white">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Cliente</p>
          <p className="mt-1 font-semibold">{doc.recipient.name}</p>
          <p>NIF {doc.recipient.nif}</p>
          <p>{doc.recipient.address}</p>
        </section>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[280px] text-sm">
            <thead>
              <tr>
                <th className={th}>Concepto</th>
                <th className={`${th} text-right`}>Uds.</th>
                <th className={`${th} text-right`}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l, i) => (
                <tr key={i}>
                  <td className={td}>{l.name}</td>
                  <td className={`${td} text-right tabular-nums`}>{l.quantity}</td>
                  <td className={`${td} text-right tabular-nums`}>{euros(l.totalCents)}</td>
                </tr>
              ))}
              {doc.feesCents > 0 && (
                <tr>
                  <td className={td}>Envío y otros cargos</td>
                  <td className={td} />
                  <td className={`${td} text-right tabular-nums`}>{euros(doc.feesCents)}</td>
                </tr>
              )}
              {doc.discountCents > 0 && (
                <tr>
                  <td className={td}>Descuentos</td>
                  <td className={td} />
                  <td className={`${td} text-right tabular-nums`}>−{euros(doc.discountCents)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-neutral-500">Importes con IVA incluido.</p>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <div className="flex items-center gap-3 text-[11px] text-neutral-600">
            <div aria-hidden className="h-[110px] w-[110px] shrink-0" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="max-w-[220px]">{doc.verifactu ? "VERI*FACTU · Factura verificable en la sede electrónica de la AEAT" : "QR de cotejo de la AEAT"}</p>
          </div>
          <dl className="ml-auto w-full max-w-[260px] text-sm">
            <div className="flex justify-between py-1">
              <dt>Base imponible</dt>
              <dd className="tabular-nums">{euros(doc.baseCents)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt>IVA {doc.taxRate} %</dt>
              <dd className="tabular-nums">{euros(doc.taxCents)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-neutral-300 pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="tabular-nums">{euros(doc.totalCents)}</dd>
            </div>
          </dl>
        </div>
        {doc.orderNumber != null && <p className="mt-8 text-[11px] text-neutral-500">Pedido nº {doc.orderNumber}</p>}
      </article>
    </main>
  );
}
