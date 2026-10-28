// Factura completa a nombre del cliente (F1/F3): los datos que la ley pide en
// una factura (RD 1619/2012, art. 6) listos para la hoja imprimible y el email.
// Ver docs/VERIFACTU.md
import { prisma } from "@/app/lib/prisma";
import { readBusiness } from "@/app/lib/business";
import { euros } from "@/app/lib/email";

export type InvoiceDoc = {
  id: string;
  numSerie: string;
  invoiceType: string;
  issueDate: string; // dd-mm-aaaa
  operationDate: string; // dd-mm-aaaa: el día del pedido
  issuer: { name: string; nif: string; address: string };
  recipient: { name: string; nif: string; address: string };
  lines: { quantity: number; name: string; totalCents: number }[];
  feesCents: number; // envío y otros cargos (con IVA)
  discountCents: number; // descuentos (con IVA), en positivo
  taxRate: number;
  baseCents: number;
  taxCents: number;
  totalCents: number;
  substitutes: string | null; // número de la factura simplificada que sustituye
  orderNumber: number | null;
  qrUrl: string;
  verifactu: boolean;
};

const dmy = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit", year: "numeric" }).format(d).replace(/\//g, "-");

export async function loadInvoiceDoc(tenantId: string, invoiceId: string): Promise<InvoiceDoc | null> {
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId, invoiceType: { in: ["F1", "F3"] } },
    include: { order: { select: { orderNumber: true, createdAt: true, feesCents: true, items: { select: { quantity: true, productName: true, totalCents: true }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!inv) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const biz = readBusiness(tenant?.settings);
  const substituted = inv.substitutedInvoiceId ? await prisma.invoice.findUnique({ where: { id: inv.substitutedInvoiceId }, select: { numSerie: true } }) : null;
  const lines = inv.order.items.map((i) => ({ quantity: i.quantity, name: i.productName, totalCents: i.totalCents }));
  const linesTotal = lines.reduce((a, l) => a + l.totalCents, 0);
  // Lo facturado manda: lo que no cuadra con las líneas son descuentos del pedido.
  const rest = inv.totalCents - linesTotal - inv.order.feesCents;
  return {
    id: inv.id,
    numSerie: inv.numSerie,
    invoiceType: inv.invoiceType,
    issueDate: inv.issueDate,
    operationDate: dmy(inv.order.createdAt),
    issuer: { name: inv.issuerName, nif: inv.issuerNif, address: [biz.street, [biz.postalCode, biz.city].filter(Boolean).join(" "), biz.province].filter(Boolean).join(", ") },
    recipient: { name: inv.recipientName ?? "", nif: inv.recipientNif ?? "", address: inv.recipientAddress ?? "" },
    lines,
    feesCents: inv.order.feesCents + Math.max(0, rest),
    discountCents: Math.max(0, -rest),
    taxRate: inv.taxRate,
    baseCents: inv.baseCents,
    taxCents: inv.taxCents,
    totalCents: inv.totalCents,
    substitutes: substituted?.numSerie ?? null,
    orderNumber: inv.order.orderNumber,
    qrUrl: inv.qrUrl,
    verifactu: inv.mode === "VERIFACTU",
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

// La misma factura en un email (HTML sencillo que se ve bien en cualquier móvil).
export function invoiceEmail(d: InvoiceDoc): { subject: string; html: string; text: string } {
  const td = "padding:6px 0;border-bottom:1px solid #eee";
  const rows = d.lines.map((l) => `<tr><td style="${td}">${l.quantity} × ${esc(l.name)}</td><td style="${td};text-align:right;white-space:nowrap">${euros(l.totalCents)}</td></tr>`).join("");
  const extra = [d.feesCents ? ["Envío y otros cargos", euros(d.feesCents)] : null, d.discountCents ? ["Descuentos", `−${euros(d.discountCents)}`] : null].filter((x): x is string[] => !!x);
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f6f4ec;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#14211c">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:16px;padding:24px">
    <h1 style="margin:0 0 4px;font-size:20px">Factura ${esc(d.numSerie)}</h1>
    <p style="margin:0 0 16px;color:#5d6b64">Fecha ${d.issueDate}${d.substitutes ? ` · Sustituye a la factura simplificada ${esc(d.substitutes)}` : ""}</p>
    <p style="margin:0 0 12px;font-size:14px"><b>${esc(d.issuer.name)}</b><br>NIF ${esc(d.issuer.nif)}<br>${esc(d.issuer.address)}</p>
    <p style="margin:0 0 16px;font-size:14px">Cliente: <b>${esc(d.recipient.name)}</b><br>NIF ${esc(d.recipient.nif)}<br>${esc(d.recipient.address)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:15px">${rows}
      ${extra.map(([k, v]) => `<tr><td style="${td}">${k}</td><td style="${td};text-align:right">${v}</td></tr>`).join("")}
      <tr><td style="padding:8px 0 0">Base imponible</td><td style="padding:8px 0 0;text-align:right">${euros(d.baseCents)}</td></tr>
      <tr><td>IVA ${d.taxRate} %</td><td style="text-align:right">${euros(d.taxCents)}</td></tr>
      <tr><td style="padding:8px 0;font-weight:700">Total</td><td style="padding:8px 0;text-align:right;font-weight:700">${euros(d.totalCents)}</td></tr></table>
    ${d.verifactu ? `<p style="margin:16px 0 0;font-size:12px;color:#5d6b64">VERI*FACTU · Factura verificable en la sede electrónica de la AEAT: <a href="${esc(d.qrUrl)}">comprobar</a></p>` : ""}
  </div></div></body></html>`;
  const text = [
    `Factura ${d.numSerie} · ${d.issueDate}`,
    d.substitutes ? `Sustituye a la factura simplificada ${d.substitutes}` : "",
    `${d.issuer.name} · NIF ${d.issuer.nif} · ${d.issuer.address}`,
    `Cliente: ${d.recipient.name} · NIF ${d.recipient.nif} · ${d.recipient.address}`,
    "",
    ...d.lines.map((l) => `${l.quantity} × ${l.name} — ${euros(l.totalCents)}`),
    ...extra.map(([k, v]) => `${k}: ${v}`),
    `Base imponible: ${euros(d.baseCents)}`,
    `IVA ${d.taxRate} %: ${euros(d.taxCents)}`,
    `Total: ${euros(d.totalCents)}`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject: `Factura ${d.numSerie} · ${d.issuer.name}`, html, text };
}
