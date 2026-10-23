// VeriFactu: facturas simplificadas encadenadas e inalterables (RD 1007/2023,
// Orden HAC/1177/2024). Se emite una factura simplificada (F2) cuando un pedido
// queda cobrado y una rectificativa por diferencias (R5) si después se cancela.
// El envío a la AEAT necesita el certificado digital del restaurante y aún no
// está: los registros quedan «PENDIENTE_ENVIO». Ver docs/VERIFACTU.md
import { createHash } from "crypto";
import { prisma } from "@/app/lib/prisma";
import { readBusiness } from "@/app/lib/business";
import { readTax } from "@/app/lib/storePolicies";
import { tenantTimeZone } from "@/app/lib/time";

// ─── Configuración (settings.verifactu) ────────────────────────────────────
export type VerifactuMode = "VERIFACTU" | "NO_VERIFACTU";
export type VerifactuEnv = "PRUEBAS" | "PRODUCCION";
export type VerifactuSettings = { enabled: boolean; mode: VerifactuMode; environment: VerifactuEnv; seriesPrefix: string };
export const DEFAULT_VERIFACTU: VerifactuSettings = { enabled: false, mode: "VERIFACTU", environment: "PRUEBAS", seriesPrefix: "T" };

export function readVerifactu(settings: unknown): VerifactuSettings {
  const v = ((settings ?? {}) as Record<string, unknown>).verifactu as Record<string, unknown> | undefined;
  if (!v || typeof v !== "object") return DEFAULT_VERIFACTU;
  const prefix = typeof v.seriesPrefix === "string" && /^[A-Z]{1,3}$/.test(v.seriesPrefix) ? v.seriesPrefix : "T";
  return {
    enabled: v.enabled === true,
    mode: v.mode === "NO_VERIFACTU" ? "NO_VERIFACTU" : "VERIFACTU",
    environment: v.environment === "PRODUCCION" ? "PRODUCCION" : "PRUEBAS",
    seriesPrefix: prefix === "R" ? "T" : prefix, // «R» queda para las rectificativas
  };
}

// ─── Formatos de la especificación ─────────────────────────────────────────
// Importe con punto y dos decimales: 1235 → «12.35», -500 → «-5.00».
export function amount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(cents);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, hh: p.hour, mm: p.minute, ss: p.second };
}
// FechaExpedicionFactura: dd-mm-aaaa en la hora del restaurante.
export function issueDateOf(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.d}-${p.m}-${p.y}`;
}
// FechaHoraHusoGenRegistro: ISO 8601 con el desfase horario («+02:00»).
export function timestampOf(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  const local = Date.UTC(+p.y, +p.m - 1, +p.d, +p.hh, +p.mm, +p.ss);
  const offsetMin = Math.round((local - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const oh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, "0");
  const om = String(Math.abs(offsetMin) % 60).padStart(2, "0");
  return `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mm}:${p.ss}${sign}${oh}:${om}`;
}

// ─── Huella (SHA-256 en hexadecimal mayúsculas) ────────────────────────────
export type AltaHashInput = { nif: string; numSerie: string; issueDate: string; invoiceType: string; taxCents: number; totalCents: number; prevHash: string | null; genTimestamp: string };
export function altaHash(i: AltaHashInput): string {
  const s =
    `IDEmisorFactura=${i.nif.trim()}` +
    `&NumSerieFactura=${i.numSerie.trim()}` +
    `&FechaExpedicionFactura=${i.issueDate}` +
    `&TipoFactura=${i.invoiceType}` +
    `&CuotaTotal=${amount(i.taxCents)}` +
    `&ImporteTotal=${amount(i.totalCents)}` +
    `&Huella=${i.prevHash ?? ""}` +
    `&FechaHoraHusoGenRegistro=${i.genTimestamp}`;
  return createHash("sha256").update(s, "utf8").digest("hex").toUpperCase();
}

// ─── QR para el cotejo en la sede electrónica de la AEAT ───────────────────
const QR_BASE: Record<VerifactuEnv, string> = {
  PRUEBAS: "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR",
  PRODUCCION: "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR",
};
export function qrUrlOf(env: VerifactuEnv, nif: string, numSerie: string, issueDate: string, totalCents: number): string {
  const q = new URLSearchParams({ nif: nif.trim(), numserie: numSerie, fecha: issueDate, importe: amount(totalCents) });
  return `${QR_BASE[env]}?${q.toString()}`;
}

// Base y cuota de un importe con IVA incluido.
export function splitTax(totalCents: number, rate: number): { baseCents: number; taxCents: number } {
  const baseCents = Math.round(totalCents / (1 + rate / 100));
  return { baseCents, taxCents: totalCents - baseCents };
}

// Lo facturado: lo que paga el cliente por la operación. La propina voluntaria
// no forma parte de la base; la tarjeta regalo es una forma de pago, no un
// descuento, así que se suma de nuevo.
export function invoiceTotalOf(o: { totalCents: number; tipCents: number; giftCardCents: number }): number {
  return o.totalCents - o.tipCents + o.giftCardCents;
}

export const pad6 = (n: number) => String(n).padStart(6, "0");

// ─── Emisión ───────────────────────────────────────────────────────────────
export class VerifactuError extends Error {}

// Emite la factura simplificada (F2) de un pedido cobrado o, con kind R5, la
// rectificativa por diferencias de uno ya facturado. Idempotente: si ya existe
// la del mismo tipo, la devuelve. Devuelve null si VeriFactu está apagado o el
// pedido no se factura.
export async function issueInvoice(orderId: string, kind: "F2" | "R5" = "F2") {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, tenantId: true, storeId: true, paymentStatus: true, status: true, totalCents: true, tipCents: true, giftCardCents: true, invoices: true, tenant: { select: { settings: true } } },
  });
  if (!order) return null;
  const cfg = readVerifactu(order.tenant.settings);
  if (!cfg.enabled) return null;
  const existing = order.invoices.find((i) => i.invoiceType === kind);
  if (existing) return existing;

  const original = order.invoices.find((i) => i.invoiceType === "F2") ?? null;
  if (kind === "F2" && order.paymentStatus !== "PAID") return null; // solo lo cobrado
  if (kind === "R5" && !original) return null; // no hay nada que rectificar

  const biz = readBusiness(order.tenant.settings);
  const nif = (biz.taxId ?? "").replace(/\s|-/g, "").toUpperCase();
  const name = (biz.legalName ?? "").trim();
  if (!nif || !name) throw new VerifactuError("Faltan la razón social o el NIF en Información del negocio");
  const tz = tenantTimeZone(order.tenant.settings);
  const rate = original?.taxRate ?? readTax(order.tenant.settings).rate;
  const total = kind === "R5" ? -original!.totalCents : invoiceTotalOf(order);
  const { baseCents, taxCents } = kind === "R5" ? { baseCents: -original!.baseCents, taxCents: -original!.taxCents } : splitTax(total, rate);

  // Un registro detrás de otro: el bloqueo evita dos huellas sobre la misma anterior.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"verifactu:" + order.tenantId}))`;
    const again = await tx.invoice.findUnique({ where: { orderId_invoiceType: { orderId: order.id, invoiceType: kind } } });
    if (again) return again;
    const prev = await tx.invoice.findFirst({ where: { tenantId: order.tenantId }, orderBy: { chainIndex: "desc" } });
    const now = new Date();
    const year = parts(now, tz).y;
    const series = `${kind === "R5" ? "R" : cfg.seriesPrefix}${year}`;
    const lastInSeries = await tx.invoice.findFirst({ where: { tenantId: order.tenantId, series }, orderBy: { number: "desc" }, select: { number: true } });
    const number = (lastInSeries?.number ?? 0) + 1;
    const numSerie = `${series}-${pad6(number)}`;
    const issueDate = issueDateOf(now, tz);
    const genTimestamp = timestampOf(now, tz);
    const prevHash = prev?.hash ?? null;
    const hash = altaHash({ nif, numSerie, issueDate, invoiceType: kind, taxCents, totalCents: total, prevHash, genTimestamp });
    return tx.invoice.create({
      data: {
        tenantId: order.tenantId,
        storeId: order.storeId,
        orderId: order.id,
        chainIndex: (prev?.chainIndex ?? 0) + 1,
        invoiceType: kind,
        series,
        number,
        numSerie,
        issueDate,
        genTimestamp,
        issuerNif: nif,
        issuerName: name,
        taxRate: rate,
        baseCents,
        taxCents,
        totalCents: total,
        rectifiedInvoiceId: kind === "R5" ? original!.id : null,
        prevHash,
        hash,
        qrUrl: qrUrlOf(cfg.environment, nif, numSerie, issueDate, total),
        mode: cfg.mode,
        environment: cfg.environment,
      },
    });
  });
}

// Para los ganchos de pago y cancelación: nunca rompe el flujo del pedido.
export async function issueInvoiceSafe(orderId: string, kind: "F2" | "R5" = "F2") {
  try {
    return await issueInvoice(orderId, kind);
  } catch (err) {
    console.error(`[verifactu] ${kind} ${orderId}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Comprueba la cadena completa: cada huella recalculada y enlazada con la anterior.
export async function verifyChain(tenantId: string): Promise<{ ok: boolean; count: number; brokenAt: string | null }> {
  const rows = await prisma.invoice.findMany({ where: { tenantId }, orderBy: { chainIndex: "asc" } });
  let prev: string | null = null;
  for (const r of rows) {
    const expected = altaHash({ nif: r.issuerNif, numSerie: r.numSerie, issueDate: r.issueDate, invoiceType: r.invoiceType, taxCents: r.taxCents, totalCents: r.totalCents, prevHash: prev, genTimestamp: r.genTimestamp });
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false, count: rows.length, brokenAt: r.numSerie };
    prev = r.hash;
  }
  return { ok: true, count: rows.length, brokenAt: null };
}
