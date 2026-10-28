// VeriFactu: facturas simplificadas encadenadas e inalterables (RD 1007/2023,
// Orden HAC/1177/2024). Se emite una factura simplificada (F2) cuando un pedido
// queda cobrado y una rectificativa por diferencias (R5) si después se cancela.
// A petición del cliente, una factura completa a su nombre: F3 si sustituye a la
// simplificada, F1 si el pedido no la tenía (y su rectificativa sería R1).
// El envío a la AEAT necesita el certificado digital del restaurante y aún no
// está: los registros quedan «PENDIENTE_ENVIO». Ver docs/VERIFACTU.md
import { createHash } from "crypto";
import { prisma } from "@/app/lib/prisma";
import { normalizeTaxId, readBusiness, TAX_ID } from "@/app/lib/business";
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
    seriesPrefix: prefix === "R" || prefix === "F" ? "T" : prefix, // «R» y «F» quedan para rectificativas y completas
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

type IssuedOrder = { id: string; tenantId: string; storeId: string; tenant: { settings: unknown } };
type RecordData = {
  kind: string;
  seriesLetter: string;
  rate: number;
  baseCents: number;
  taxCents: number;
  totalCents: number;
  rectifiedInvoiceId?: string | null;
  substitutedInvoiceId?: string | null;
  recipient?: Recipient | null;
};

// Añade un registro al final de la cadena del emisor. Idempotente por (pedido, tipo).
async function appendRecord(order: IssuedOrder, cfg: VerifactuSettings, d: RecordData) {
  const biz = readBusiness(order.tenant.settings);
  const nif = (biz.taxId ?? "").replace(/\s|-/g, "").toUpperCase();
  const name = (biz.legalName ?? "").trim();
  if (!nif || !name) throw new VerifactuError("Faltan la razón social o el NIF en Información del negocio");
  const tz = tenantTimeZone(order.tenant.settings);

  // Un registro detrás de otro: el bloqueo evita dos huellas sobre la misma anterior.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"verifactu:" + order.tenantId}))`;
    const again = await tx.invoice.findUnique({ where: { orderId_invoiceType: { orderId: order.id, invoiceType: d.kind } } });
    if (again) return again;
    const prev = await tx.invoice.findFirst({ where: { tenantId: order.tenantId }, orderBy: { chainIndex: "desc" } });
    const now = new Date();
    const year = parts(now, tz).y;
    const series = `${d.seriesLetter}${year}`;
    const lastInSeries = await tx.invoice.findFirst({ where: { tenantId: order.tenantId, series }, orderBy: { number: "desc" }, select: { number: true } });
    const number = (lastInSeries?.number ?? 0) + 1;
    const numSerie = `${series}-${pad6(number)}`;
    const issueDate = issueDateOf(now, tz);
    const genTimestamp = timestampOf(now, tz);
    const prevHash = prev?.hash ?? null;
    const hash = altaHash({ nif, numSerie, issueDate, invoiceType: d.kind, taxCents: d.taxCents, totalCents: d.totalCents, prevHash, genTimestamp });
    return tx.invoice.create({
      data: {
        tenantId: order.tenantId,
        storeId: order.storeId,
        orderId: order.id,
        chainIndex: (prev?.chainIndex ?? 0) + 1,
        invoiceType: d.kind,
        series,
        number,
        numSerie,
        issueDate,
        genTimestamp,
        issuerNif: nif,
        issuerName: name,
        taxRate: d.rate,
        baseCents: d.baseCents,
        taxCents: d.taxCents,
        totalCents: d.totalCents,
        rectifiedInvoiceId: d.rectifiedInvoiceId ?? null,
        substitutedInvoiceId: d.substitutedInvoiceId ?? null,
        recipientNif: d.recipient?.nif ?? null,
        recipientName: d.recipient?.name ?? null,
        recipientAddress: d.recipient?.address ?? null,
        prevHash,
        hash,
        qrUrl: qrUrlOf(cfg.environment, nif, numSerie, issueDate, d.totalCents),
        mode: cfg.mode,
        environment: cfg.environment,
      },
    });
  });
}

const FULL_TYPES = ["F1", "F3"];
const orderSelect = { id: true, tenantId: true, storeId: true, paymentStatus: true, status: true, totalCents: true, tipCents: true, giftCardCents: true, invoices: true, tenant: { select: { settings: true } } } as const;

// Emite la factura simplificada (F2) de un pedido cobrado o, con kind R5, la
// rectificativa de uno ya facturado (R1 si tenía factura completa). Idempotente:
// si ya existe la del mismo tipo, la devuelve. Devuelve null si VeriFactu está
// apagado o el pedido no se factura.
export async function issueInvoice(orderId: string, kind: "F2" | "R5" = "F2") {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  if (!order) return null;
  const cfg = readVerifactu(order.tenant.settings);
  if (!cfg.enabled) return null;

  if (kind === "F2") {
    const existing = order.invoices.find((i) => i.invoiceType === "F2");
    if (existing) return existing;
    if (order.paymentStatus !== "PAID") return null; // solo lo cobrado
    const rate = readTax(order.tenant.settings).rate;
    const total = invoiceTotalOf(order);
    return appendRecord(order, cfg, { kind: "F2", seriesLetter: cfg.seriesPrefix, rate, ...splitTax(total, rate), totalCents: total });
  }

  // Se rectifica la factura vigente: la completa si se hizo, si no la simplificada.
  const full = order.invoices.find((i) => FULL_TYPES.includes(i.invoiceType)) ?? null;
  const original = full ?? order.invoices.find((i) => i.invoiceType === "F2") ?? null;
  if (!original) return null; // no hay nada que rectificar
  const rKind = full ? "R1" : "R5";
  const existing = order.invoices.find((i) => i.invoiceType === rKind);
  if (existing) return existing;
  return appendRecord(order, cfg, { kind: rKind, seriesLetter: "R", rate: original.taxRate, baseCents: -original.baseCents, taxCents: -original.taxCents, totalCents: -original.totalCents, rectifiedInvoiceId: original.id });
}

// ─── Factura completa a nombre del cliente ─────────────────────────────────
export type Recipient = { nif: string; name: string; address: string };

// Valida los datos del cliente: NIF/CIF/NIE con formato válido, nombre y domicilio.
export function readRecipient(b: unknown): Recipient | string {
  const o = (b ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
  const nif = normalizeTaxId(str(o.nif, 20));
  const name = str(o.name, 120);
  const address = str(o.address, 250);
  if (!TAX_ID.test(nif)) return "El NIF / CIF del cliente no tiene un formato válido (p. ej. B12345678 o 12345678Z)";
  if (name.length < 2) return "Falta el nombre o la razón social del cliente";
  if (address.length < 5) return "Falta el domicilio del cliente (calle, código postal y ciudad)";
  return { nif, name, address };
}

// Factura completa de un pedido cobrado. Sustituye a su simplificada (F3, mismos
// importes) o, si no la tenía, es una F1. Una por pedido: si ya existe, la devuelve.
export async function issueFullInvoice(orderId: string, recipient: Recipient) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: orderSelect });
  if (!order) throw new VerifactuError("Pedido no encontrado");
  const cfg = readVerifactu(order.tenant.settings);
  if (!cfg.enabled) throw new VerifactuError("Para hacer facturas, activa VeriFactu en Configuración → Facturación (necesita la razón social y el NIF del negocio)");
  const existing = order.invoices.find((i) => FULL_TYPES.includes(i.invoiceType));
  if (existing) return existing;
  if (order.invoices.some((i) => i.invoiceType.startsWith("R")) || order.status === "CANCELLED") throw new VerifactuError("Este pedido está cancelado o devuelto: no se puede facturar");
  if (order.paymentStatus !== "PAID") throw new VerifactuError("El pedido aún no está cobrado: cóbralo primero y luego haz la factura");
  const simplified = order.invoices.find((i) => i.invoiceType === "F2") ?? null;
  if (simplified) {
    return appendRecord(order, cfg, { kind: "F3", seriesLetter: "F", rate: simplified.taxRate, baseCents: simplified.baseCents, taxCents: simplified.taxCents, totalCents: simplified.totalCents, substitutedInvoiceId: simplified.id, recipient });
  }
  const rate = readTax(order.tenant.settings).rate;
  const total = invoiceTotalOf(order);
  return appendRecord(order, cfg, { kind: "F1", seriesLetter: "F", rate, ...splitTax(total, rate), totalCents: total, recipient });
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
