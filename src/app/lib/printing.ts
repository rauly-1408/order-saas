// Impresión de comandas y tickets: configuración en settings.printing, cola en
// PrintJob y un agente en el local que la vacía contra la impresora (puerto
// 9100). Ver docs/IMPRESION.md
import { randomBytes } from "crypto";
import type { PrintKind, Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { Escpos, type Codepage } from "@/app/lib/escpos";
import { readBusiness } from "@/app/lib/business";
import { includedTax, readTax } from "@/app/lib/storePolicies";
import { modifierLabels } from "@/app/lib/menuOptions";
import { tenantTimeZone } from "@/app/lib/time";

export type PrinterRole = "kitchen" | "receipt";
export type Printer = {
  id: string;
  name: string;
  host: string; // IP en la red del local
  port: number; // 9100 casi siempre
  roles: PrinterRole[];
  width: 48 | 42 | 32; // caracteres por línea: 80 mm = 48, 58 mm = 32
  codepage: Codepage;
  drawer: boolean; // abre el cajón al cobrar en efectivo
  copies: number; // copias de la comanda (1–3)
};
export type PrintingSettings = {
  agentToken: string | null;
  agentSeenAt: string | null;
  autoKitchen: boolean; // comanda al entrar cualquier pedido
  autoReceipt: boolean; // ticket al cobrar en la Caja
  printers: Printer[];
};

const HOST = /^(\d{1,3}\.){3}\d{1,3}$|^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;

export function readPrinting(settings: unknown): PrintingSettings {
  const p = ((settings ?? {}) as Record<string, unknown>).printing as Record<string, unknown> | undefined;
  const list = Array.isArray(p?.printers) ? (p!.printers as unknown[]) : [];
  return {
    agentToken: typeof p?.agentToken === "string" ? p.agentToken : null,
    agentSeenAt: typeof p?.agentSeenAt === "string" ? p.agentSeenAt : null,
    autoKitchen: p?.autoKitchen !== false,
    autoReceipt: p?.autoReceipt !== false,
    printers: list.map(parsePrinter).filter((x): x is Printer => x !== null),
  };
}

export function parsePrinter(raw: unknown): Printer | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const host = typeof r.host === "string" ? r.host.trim() : "";
  if (!HOST.test(host)) return null;
  const roles = (Array.isArray(r.roles) ? r.roles : []).filter((x): x is PrinterRole => x === "kitchen" || x === "receipt");
  const width = r.width === 42 || r.width === 32 ? r.width : 48;
  const port = Number.isInteger(r.port) && (r.port as number) > 0 && (r.port as number) < 65536 ? (r.port as number) : 9100;
  const copies = Number.isInteger(r.copies) ? Math.min(Math.max(r.copies as number, 1), 3) : 1;
  return {
    id: typeof r.id === "string" && /^[a-z0-9_-]{1,40}$/i.test(r.id) ? r.id : randomBytes(4).toString("hex"),
    name: (typeof r.name === "string" && r.name.trim().slice(0, 40)) || host,
    host,
    port,
    roles,
    width,
    codepage: r.codepage === "ascii" ? "ascii" : "cp858",
    drawer: r.drawer === true,
    copies,
  };
}

export const newAgentToken = () => randomBytes(24).toString("base64url");

const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";
const hhmm = (d: Date, tz: string) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
const dmy = (d: Date, tz: string) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz }).format(d);

type OrderForPrint = Prisma.OrderGetPayload<{ include: { items: true; invoices: true; tenant: { select: { name: true; slug: true; settings: true } }; store: { select: { name: true; address: true; phone: true } } } }>;

const PAYMENT_LABEL: Record<string, string> = { CASH: "efectivo", CARD_TERMINAL: "datáfono", BIZUM: "Bizum", CARD: "tarjeta online", IN_STORE: "al recoger" };
const modeOf = (o: OrderForPrint) => (o.channel === "DELIVERY" ? "A DOMICILIO" : o.dineIn ? "COMER AQUÍ" : "PARA LLEVAR");
const sourceOf = (o: OrderForPrint) => (o.source === "COUNTER" ? "Mostrador" : o.source === "PHONE" ? "Teléfono" : "Online");

// Comanda para cocina: grande y sin precios.
export function renderKitchen(o: OrderForPrint, p: Printer): Uint8Array {
  const tz = tenantTimeZone(o.tenant.settings);
  const t = new Escpos({ width: p.width, codepage: p.codepage });
  t.align("center").bold(true).size(2, 2).line(`Nº ${o.orderNumber ?? "?"}`).size(1, 1).bold(false);
  t.line(`${hhmm(o.createdAt, tz)} · ${sourceOf(o)}`);
  t.bold(true).size(1, 2).line(modeOf(o)).size(1, 1).bold(false);
  if (o.scheduledFor) t.bold(true).line(`PROGRAMADO: ${dmy(o.scheduledFor, tz)} ${hhmm(o.scheduledFor, tz)}`).bold(false);
  t.align("left").rule("=");
  if (o.customerName && !["Mostrador", "Teléfono"].includes(o.customerName)) t.line(`Cliente: ${o.customerName}${o.customerPhone ? ` · ${o.customerPhone}` : ""}`);
  if (o.channel === "DELIVERY" && o.customerAddress) t.wrap(`Dirección: ${o.customerAddress}`);
  t.rule();
  for (const l of o.items) {
    t.bold(true).size(1, 2).wrap(`${l.quantity}x ${l.productName}`).size(1, 1).bold(false);
    for (const m of modifierLabels(l.modifiers)) t.wrap(m, { indent: 3 });
    if (l.note) t.bold(true).wrap(`>> ${l.note}`, { indent: 3 }).bold(false);
  }
  t.rule();
  if (o.notes) t.bold(true).wrap(`NOTA: ${o.notes}`).bold(false).rule();
  t.align("center").bold(true).line(o.paymentStatus === "PAID" ? `PAGADO (${PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod})` : "SIN COBRAR").bold(false);
  t.cut();
  return t.bytes();
}

// Ticket para el cliente: con precios, IVA incluido y datos del negocio.
export function renderReceipt(o: OrderForPrint, p: Printer): Uint8Array {
  const tz = tenantTimeZone(o.tenant.settings);
  const biz = readBusiness(o.tenant.settings);
  const tax = readTax(o.tenant.settings);
  const t = new Escpos({ width: p.width, codepage: p.codepage });
  t.align("center").bold(true).size(2, 2).line(o.tenant.name).size(1, 1).bold(false);
  const addr = [o.store.address || biz.street, [biz.postalCode, biz.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  if (addr) t.wrap(addr);
  if (biz.legalName && biz.legalName !== o.tenant.name) t.wrap(biz.legalName);
  if (biz.taxId) t.line(`NIF ${biz.taxId}`);
  const phone = o.store.phone || biz.phone;
  if (phone) t.line(`Tel. ${phone}`);
  // VeriFactu: con factura, el ticket es la factura simplificada.
  const invoice = o.invoices.find((i) => i.invoiceType === "F2") ?? null;
  t.align("left").rule();
  if (invoice) {
    t.align("center").bold(true).line("FACTURA SIMPLIFICADA").bold(false).line(`Nº ${invoice.numSerie} · ${invoice.issueDate}`).align("left");
    t.line(`Emisor: ${invoice.issuerName} · NIF ${invoice.issuerNif}`);
    t.rule();
  }
  t.bold(true).row(`Pedido nº ${o.orderNumber ?? "?"}`, `${dmy(o.createdAt, tz)} ${hhmm(o.createdAt, tz)}`).bold(false);
  t.line(`${modeOf(o).charAt(0)}${modeOf(o).slice(1).toLowerCase()} · ${sourceOf(o)}`);
  if (o.customerName && !["Mostrador", "Teléfono"].includes(o.customerName)) t.line(`Cliente: ${o.customerName}`);
  if (o.channel === "DELIVERY" && o.customerAddress) t.wrap(o.customerAddress);
  t.rule();
  for (const l of o.items) {
    const gross = l.totalCents + (l.discountCents ?? 0);
    t.row(`${l.quantity}x ${l.productName}`, euros(gross));
    const mods = modifierLabels(l.modifiers);
    if (mods.length) t.wrap(mods.join(", "), { indent: 3 });
    if (l.note) t.wrap(l.note, { indent: 3 });
    if ((l.discountCents ?? 0) > 0) t.row("descuento", `-${euros(l.discountCents ?? 0)}`, { indent: 3 });
  }
  t.rule();
  const lines = o.items.reduce((a, l) => a + l.totalCents, 0);
  const hasExtras = o.feesCents > 0 || o.discountCents > 0 || o.tipCents > 0 || o.giftCardCents > 0;
  if (hasExtras) {
    t.row("Subtotal", euros(lines));
    if (o.feesCents > 0) t.row("Envío", euros(o.feesCents));
    if (o.discountCents > 0) t.row("Descuento", `-${euros(o.discountCents)}`);
    if (o.tipCents > 0) t.row("Propina", euros(o.tipCents));
    if (o.giftCardCents > 0) t.row("Tarjeta regalo", `-${euros(o.giftCardCents)}`);
  }
  t.bold(true).size(1, 2).row("TOTAL", euros(o.totalCents)).size(1, 1).bold(false);
  if (invoice) {
    t.row(`Base imponible (IVA ${invoice.taxRate}%)`, euros(invoice.baseCents));
    t.row(`Cuota IVA ${invoice.taxRate}%`, euros(invoice.taxCents));
    if (invoice.totalCents !== o.totalCents) t.row("Importe facturado", euros(invoice.totalCents));
  } else if (tax.showOnReceipt) t.row(`IVA ${tax.rate}% incluido`, euros(includedTax(o.totalCents, tax.rate)));
  if (o.paymentStatus === "PAID") {
    t.line(`Pagado · ${PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}`);
    if (o.paymentMethod === "CASH" && o.cashTenderedCents != null && o.cashTenderedCents >= o.totalCents) {
      t.row("Entregado", euros(o.cashTenderedCents));
      t.row("Cambio", euros(o.cashTenderedCents - o.totalCents));
    }
  } else t.bold(true).line(`PENDIENTE DE PAGO · ${PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}`).bold(false);
  t.rule();
  if (invoice) {
    // QR de cotejo de la AEAT; con VERI*FACTU, la leyenda obligatoria.
    t.align("center").qr(invoice.qrUrl, p.width === 32 ? 4 : 6).feed(1);
    if (invoice.mode === "VERIFACTU") t.bold(true).line("VERI*FACTU").bold(false).line("Factura verificable en la sede");
    if (invoice.mode === "VERIFACTU") t.line("electrónica de la AEAT");
    t.rule();
  }
  t.align("center").line("¡Gracias por tu pedido!");
  const origin = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (origin) t.line(`Pide online: ${origin.replace(/^https?:\/\//, "")}/pedir/${o.tenant.slug}`);
  if (p.drawer && o.paymentMethod === "CASH" && o.paymentStatus === "PAID") t.drawer();
  t.cut();
  return t.bytes();
}

export function renderTest(p: Printer, tenantName: string): Uint8Array {
  const t = new Escpos({ width: p.width, codepage: p.codepage });
  t.align("center").bold(true).size(2, 2).line("PRUEBA").size(1, 1).bold(false);
  t.line(tenantName).line(`${p.name} · ${p.host}:${p.port}`).line(new Date().toLocaleString("es-ES", { timeZone: "Europe/Madrid" }));
  t.align("left").rule();
  t.line("Acentos: áéíóú ñ Ñ ü ¿¡ · € 1,50");
  t.line("Si ves símbolos raros arriba, cambia la");
  t.line("codificación de esta impresora a «Sin acentos».");
  t.rule();
  t.row("Ancho de línea", `${p.width}`);
  t.line("X".repeat(p.width));
  t.rule();
  t.line(`Imprime: ${p.roles.map((r) => (r === "kitchen" ? "comandas" : "tickets")).join(" y ") || "nada (sin uso asignado)"}`);
  if (p.drawer) t.line("Cajón: se abre al cobrar en efectivo").drawer();
  t.cut();
  return t.bytes();
}

async function loadOrder(orderId: string): Promise<OrderForPrint | null> {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, invoices: true, tenant: { select: { name: true, slug: true, settings: true } }, store: { select: { name: true, address: true, phone: true } } },
  });
}

// Encola la comanda y/o el ticket de un pedido en las impresoras con ese uso.
export async function enqueueOrderPrints(orderId: string, kinds: ("KITCHEN" | "RECEIPT")[]): Promise<number> {
  const o = await loadOrder(orderId);
  if (!o) return 0;
  const cfg = readPrinting(o.tenant.settings);
  if (!cfg.agentToken || !cfg.printers.length) return 0;
  const jobs: Prisma.PrintJobCreateManyInput[] = [];
  for (const kind of kinds) {
    const role: PrinterRole = kind === "KITCHEN" ? "kitchen" : "receipt";
    for (const p of cfg.printers.filter((x) => x.roles.includes(role))) {
      const data = kind === "KITCHEN" ? renderKitchen(o, p) : renderReceipt(o, p);
      const copies = kind === "KITCHEN" ? p.copies : 1;
      for (let i = 0; i < copies; i++) jobs.push({ tenantId: o.tenantId, orderId: o.id, kind: kind as PrintKind, printerId: p.id, host: p.host, port: p.port, data: Buffer.from(data) });
    }
  }
  if (jobs.length) await prisma.printJob.createMany({ data: jobs });
  return jobs.length;
}

// Al entrar un pedido (ya pagado si era online): comanda; y ticket si se cobró en la Caja.
export async function printOnNewOrder(orderId: string): Promise<void> {
  try {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, source: true, paymentStatus: true, tenant: { select: { settings: true } } } });
    if (!o || o.status === "AWAITING_PAYMENT" || o.status === "CANCELLED") return;
    const cfg = readPrinting(o.tenant.settings);
    const kinds: ("KITCHEN" | "RECEIPT")[] = [];
    if (cfg.autoKitchen) kinds.push("KITCHEN");
    if (cfg.autoReceipt && o.source !== "ONLINE" && o.paymentStatus === "PAID") kinds.push("RECEIPT");
    if (kinds.length) await enqueueOrderPrints(orderId, kinds);
  } catch (err) {
    console.error("[printOnNewOrder]", err instanceof Error ? err.message : err);
  }
}

export async function enqueueTest(tenantId: string, tenantName: string, p: Printer): Promise<void> {
  await prisma.printJob.create({ data: { tenantId, kind: "TEST", printerId: p.id, host: p.host, port: p.port, data: Buffer.from(renderTest(p, tenantName)) } });
}

// Informe Z: resumen del cierre de caja en la impresora de tickets.
const PAY_NAME: Record<string, string> = { CASH: "Efectivo", CARD_TERMINAL: "Datáfono", BIZUM: "Bizum", CARD: "Tarjeta online", IN_STORE: "Al recoger" };
export function renderClosing(
  c: {
    openedAt: Date;
    closedAt: Date;
    openedByName: string | null;
    closedByName: string | null;
    openingFloatCents: number;
    countedCashCents: number;
    expectedCashCents: number;
    differenceCents: number;
    summary: { orders: number; byPayment: Record<string, number>; totalCents: number; inCents: number; outCents: number };
    notes: string | null;
    storeName: string;
    tenantName: string;
    tz: string;
  },
  p: Printer
): Uint8Array {
  const t = new Escpos({ width: p.width, codepage: p.codepage });
  t.align("center").bold(true).size(2, 2).line("CIERRE DE CAJA").size(1, 1).bold(false);
  t.line(c.tenantName).line(c.storeName);
  t.align("left").rule();
  t.row("Apertura", `${dmy(c.openedAt, c.tz)} ${hhmm(c.openedAt, c.tz)}`);
  if (c.openedByName) t.row("  por", c.openedByName);
  t.row("Cierre", `${dmy(c.closedAt, c.tz)} ${hhmm(c.closedAt, c.tz)}`);
  if (c.closedByName) t.row("  por", c.closedByName);
  t.rule();
  t.bold(true).line("VENTAS COBRADAS").bold(false);
  for (const [k, v] of Object.entries(c.summary.byPayment)) if (v) t.row(PAY_NAME[k] ?? k, euros(v));
  t.bold(true).row(`Total (${c.summary.orders} pedidos)`, euros(c.summary.totalCents)).bold(false);
  t.rule();
  t.bold(true).line("EFECTIVO EN EL CAJÓN").bold(false);
  t.row("Fondo de apertura", euros(c.openingFloatCents));
  t.row("+ Ventas en efectivo", euros(c.summary.byPayment.CASH ?? 0));
  if (c.summary.inCents) t.row("+ Entradas", euros(c.summary.inCents));
  if (c.summary.outCents) t.row("- Salidas", euros(c.summary.outCents));
  t.bold(true).row("Debería haber", euros(c.expectedCashCents)).bold(false);
  t.row("Contado", euros(c.countedCashCents));
  t.bold(true).size(1, 2).row(c.differenceCents === 0 ? "Cuadra" : c.differenceCents > 0 ? "Sobra" : "Falta", euros(Math.abs(c.differenceCents))).size(1, 1).bold(false);
  if (c.notes) t.rule().wrap(`Nota: ${c.notes}`);
  t.cut();
  return t.bytes();
}

export async function enqueueClosing(sessionId: string): Promise<number> {
  const s = await prisma.cashSession.findUnique({ where: { id: sessionId } });
  if (!s || !s.closedAt || s.countedCashCents == null || s.expectedCashCents == null || s.differenceCents == null) return 0;
  const [tenant, store] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: s.tenantId }, select: { name: true, settings: true } }),
    prisma.store.findUnique({ where: { id: s.storeId }, select: { name: true } }),
  ]);
  if (!tenant) return 0;
  const cfg = readPrinting(tenant.settings);
  const printers = cfg.agentToken ? cfg.printers.filter((x) => x.roles.includes("receipt")) : [];
  if (!printers.length) return 0;
  const summary = s.summary as unknown as { orders: number; byPayment: Record<string, number>; totalCents: number; inCents: number; outCents: number };
  const data = {
    openedAt: s.openedAt,
    closedAt: s.closedAt,
    openedByName: s.openedByName,
    closedByName: s.closedByName,
    openingFloatCents: s.openingFloatCents,
    countedCashCents: s.countedCashCents,
    expectedCashCents: s.expectedCashCents,
    differenceCents: s.differenceCents,
    summary,
    notes: s.notes,
    storeName: store?.name ?? "",
    tenantName: tenant.name,
    tz: tenantTimeZone(tenant.settings),
  };
  await prisma.printJob.createMany({ data: printers.map((p) => ({ tenantId: s.tenantId, kind: "CLOSING" as PrintKind, printerId: p.id, host: p.host, port: p.port, data: Buffer.from(renderClosing(data, p)) })) });
  return printers.length;
}
