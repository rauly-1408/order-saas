// VeriFactu: envío a la AEAT de los registros «PENDIENTE_ENVIO», en orden de la
// cadena, con el certificado digital del restaurante. Respeta el control de flujo
// de la AEAT: tras cada envío hay que esperar lo que diga TiempoEsperaEnvio
// (normalmente 60 s) o juntar 1.000 registros. Se lanza al emitir cada factura,
// con el botón «Enviar ahora» y en el cron diario. Ver docs/VERIFACTU.md
import { request as httpRequest } from "node:http";
import { request } from "node:https";
import { after } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { seal, unseal } from "@/app/lib/secretBox";
import { AEAT_ENDPOINTS, envelopeXml, MAX_RECORDS_PER_SEND, parseResponse, type AltaRecord, type SendResult, type SoftwareInfo } from "@/app/lib/aeatXml";
import { readVerifactu, type VerifactuEnv } from "@/app/lib/verifactu";
import type { ParsedCert } from "@/app/lib/aeatCert";

const CERT_PURPOSE = "aeat-cert";
const LOCK_MS = 5 * 60_000;
const MAX_INLINE_WAIT_MS = 65_000; // dentro de una petición se espera como mucho esto
const MAX_ROUNDS = 3;

export function sealCert(c: ParsedCert): string {
  return seal({ key: c.keyPem, cert: c.certPem }, CERT_PURPOSE);
}

export function softwareInfo(tenantId: string): SoftwareInfo | null {
  const producerName = process.env.VERIFACTU_PRODUCER_NAME?.trim();
  const producerNif = process.env.VERIFACTU_PRODUCER_NIF?.trim().toUpperCase();
  if (!producerName || !producerNif) return null;
  return { producerName, producerNif, name: "NorApp", id: "NA", version: process.env.VERIFACTU_SOFTWARE_VERSION?.trim() || "1.0", installation: tenantId };
}

// En local se puede apuntar a un servidor de pruebas propio (nunca en Vercel).
function endpointFor(env: VerifactuEnv): string {
  const override = process.env.AEAT_ENDPOINT_OVERRIDE;
  if (override && !process.env.VERCEL) return override;
  return AEAT_ENDPOINTS[env];
}

function post(url: string, body: string, cert: { key: string; cert: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isHttp = u.protocol === "http:";
    const doRequest = isHttp ? httpRequest : request;
    const req = doRequest(
      {
        method: "POST",
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""', "Content-Length": Buffer.byteLength(body) },
        ...(isHttp ? {} : { key: cert.key, cert: cert.cert }),
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    req.on("timeout", () => req.destroy(new Error("La AEAT no responde (tiempo agotado)")));
    req.on("error", reject);
    req.end(body);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SendOutcome = { sent: number; accepted: number; rejected: number; pending: number; waitUntil: Date | null; error: string | null };

// Un envío (hasta 1.000 registros del mismo entorno). Devuelve null si no hay nada.
async function sendBatch(tenantId: string, cert: { key: string; cert: string }, sw: SoftwareInfo): Promise<{ result: SendResult; count: number } | null> {
  const first = await prisma.invoice.findFirst({ where: { tenantId, aeatStatus: "PENDIENTE_ENVIO", mode: "VERIFACTU" }, orderBy: { chainIndex: "asc" }, select: { environment: true } });
  if (!first) return null;
  const env = first.environment as VerifactuEnv;
  const rows = await prisma.invoice.findMany({ where: { tenantId, aeatStatus: "PENDIENTE_ENVIO", mode: "VERIFACTU", environment: env }, orderBy: { chainIndex: "asc" }, take: MAX_RECORDS_PER_SEND });
  const minIndex = rows[0].chainIndex;
  const refIds = [...new Set(rows.flatMap((r) => [r.rectifiedInvoiceId, r.substitutedInvoiceId]).filter((x): x is string => Boolean(x)))];
  const [previous, refs] = await Promise.all([
    minIndex > 1 ? prisma.invoice.findUnique({ where: { tenantId_chainIndex: { tenantId, chainIndex: minIndex - 1 } } }) : Promise.resolve(null),
    refIds.length ? prisma.invoice.findMany({ where: { id: { in: refIds } } }) : Promise.resolve([]),
  ]);
  const byId = new Map(refs.map((r) => [r.id, r]));
  const idOf = (r: { issuerNif: string; numSerie: string; issueDate: string }) => ({ nif: r.issuerNif, numSerie: r.numSerie, issueDate: r.issueDate });

  let prev = previous;
  const records: AltaRecord[] = rows.map((r) => {
    const rectified = r.rectifiedInvoiceId ? byId.get(r.rectifiedInvoiceId) ?? null : null;
    const recipientSource = r.recipientNif ? r : r.invoiceType === "R1" && rectified?.recipientNif ? rectified : null;
    const rec: AltaRecord = {
      id: idOf(r),
      issuerName: r.issuerName,
      invoiceType: r.invoiceType,
      rectified: rectified ? idOf(rectified) : null,
      substituted: r.substitutedInvoiceId && byId.get(r.substitutedInvoiceId) ? idOf(byId.get(r.substitutedInvoiceId)!) : null,
      recipient: recipientSource?.recipientNif ? { nif: recipientSource.recipientNif, name: recipientSource.recipientName ?? "" } : null,
      taxRate: r.taxRate,
      baseCents: r.baseCents,
      taxCents: r.taxCents,
      totalCents: r.totalCents,
      previous: prev ? { ...idOf(prev), hash: prev.hash } : null,
      genTimestamp: r.genTimestamp,
      hash: r.hash,
    };
    prev = r;
    return rec;
  });

  const head = rows[0];
  const holder = await prisma.verifactuSender.findUnique({ where: { tenantId }, select: { holderNif: true, holderName: true } });
  const representative = holder?.holderNif && holder.holderNif !== head.issuerNif ? { nif: holder.holderNif, name: holder.holderName ?? holder.holderNif } : null;
  const xml = envelopeXml({ issuerName: head.issuerName, issuerNif: head.issuerNif, representative }, records, sw);

  let result: SendResult;
  try {
    result = parseResponse(await post(endpointFor(env), xml, cert));
  } catch (err) {
    result = { ok: false, fault: err instanceof Error ? err.message : "No se pudo conectar con la AEAT" };
  }
  if (!result.ok) return { result, count: 0 };

  const at = new Date().toISOString();
  const byNum = new Map(result.lines.map((l) => [l.numSerie, l]));
  for (const r of rows) {
    const line = byNum.get(r.numSerie);
    if (!line) continue; // sin respuesta para él: sigue pendiente
    await prisma.invoice.update({
      where: { id: r.id },
      data: { aeatStatus: line.status, aeatResponse: { at, csv: result.csv, state: result.state, code: line.code, description: line.description } },
    });
  }
  return { result, count: rows.length };
}

// Envía lo pendiente de un restaurante. Un solo envío a la vez (lockedUntil) y
// respetando la espera de la AEAT. Nunca lanza.
export async function sendPending(tenantId: string, opts: { waitInline?: boolean } = {}): Promise<SendOutcome> {
  const empty = (error: string | null, waitUntil: Date | null = null): SendOutcome => ({ sent: 0, accepted: 0, rejected: 0, pending: 0, waitUntil, error });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    if (!tenant || !readVerifactu(tenant.settings).enabled) return empty(null);
    const sw = softwareInfo(tenantId);
    if (!sw) return empty("Falta el fabricante del programa (declaración responsable)");
    const sender = await prisma.verifactuSender.findUnique({ where: { tenantId } });
    const cert = unseal(sender?.certSealed, CERT_PURPOSE);
    if (!sender || !cert.key || !cert.cert) return empty("Falta el certificado digital");
    if (sender.notAfter && sender.notAfter < new Date()) return empty("El certificado digital ha caducado");

    const now = new Date();
    const claimed = await prisma.verifactuSender.updateMany({
      where: { tenantId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
    });
    if (claimed.count === 0) return empty(null); // otro envío en marcha: ya lo recogerá

    const out: SendOutcome = { sent: 0, accepted: 0, rejected: 0, pending: 0, waitUntil: null, error: null };
    let nextSendAt = sender.nextSendAt;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const left = await prisma.invoice.count({ where: { tenantId, aeatStatus: "PENDIENTE_ENVIO", mode: "VERIFACTU" } });
        if (left === 0) break;
        const wait = nextSendAt ? nextSendAt.getTime() - Date.now() : 0;
        if (wait > 0) {
          if (!opts.waitInline || wait > MAX_INLINE_WAIT_MS) {
            out.waitUntil = nextSendAt;
            break;
          }
          await sleep(wait);
        }
        const batch = await sendBatch(tenantId, { key: cert.key, cert: cert.cert }, sw);
        if (!batch) break;
        if (!batch.result.ok) {
          out.error = batch.result.fault;
          nextSendAt = new Date(Date.now() + 60_000);
          break;
        }
        out.sent += batch.count;
        out.accepted += batch.result.lines.filter((l) => l.status !== "RECHAZADO").length;
        out.rejected += batch.result.lines.filter((l) => l.status === "RECHAZADO").length;
        nextSendAt = new Date(Date.now() + batch.result.waitSeconds * 1000);
        if (batch.count < MAX_RECORDS_PER_SEND && !opts.waitInline) {
          out.waitUntil = nextSendAt;
          break;
        }
      }
    } finally {
      await prisma.verifactuSender.update({
        where: { tenantId },
        data: { lockedUntil: null, nextSendAt, lastError: out.error, ...(out.sent > 0 ? { lastSentAt: new Date() } : {}) },
      });
    }
    out.pending = await prisma.invoice.count({ where: { tenantId, aeatStatus: "PENDIENTE_ENVIO", mode: "VERIFACTU" } });
    return out;
  } catch (err) {
    console.error("[aeat] envío", tenantId, err instanceof Error ? err.message : err);
    return empty("Error inesperado al enviar a la AEAT");
  }
}

// Tras emitir una factura: se envía en segundo plano, esperando si toca.
export function queueAeatSend(tenantId: string) {
  const run = () => sendPending(tenantId, { waitInline: true }).then((o) => o.error && console.warn("[aeat]", tenantId, o.error));
  try {
    after(run);
  } catch {
    void run(); // fuera de una petición (pruebas, scripts)
  }
}

// Cron diario: lo que quede pendiente en todos los restaurantes con certificado.
export async function sendAllPending(): Promise<{ tenants: number; sent: number }> {
  const senders = await prisma.verifactuSender.findMany({ where: { certSealed: { not: null } }, select: { tenantId: true } });
  let sent = 0;
  for (const s of senders) sent += (await sendPending(s.tenantId, { waitInline: true })).sent;
  return { tenants: senders.length, sent };
}
