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
  storeId: string | null; // local donde está (null = imprime los pedidos de todos)
  // Comandas: solo estas categorías de la carta (null = todo). «LIBRE» = productos libres.
  // Ej.: cocina con la comida y barra con «Bebidas». Ver docs/IMPRESION.md
  categories: string[] | null;
};

export const FREE_CATEGORY = "LIBRE";
export type PrintingSettings = {
  agentToken: string | null;
  agentSeenAt: string | null;
  autoKitchen: boolean; // comanda al entrar cualquier pedido
  autoReceipt: boolean; // ticket al cobrar en la Caja
  printers: Printer[];
};

// Solo impresoras de la red del local: IPv4 privada y puertos de impresión en
// crudo (9100–9109). Así el agente no se puede usar para conectar con otra cosa.
export function isPrinterAddress(host: string, port: number): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m || m.slice(1).some((x) => Number(x) > 255)) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  const privateNet = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  return privateNet && Number.isInteger(port) && port >= 9100 && port <= 9109;
}

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
  const port = r.port === undefined || r.port === null || r.port === "" ? 9100 : Number(r.port);
  if (!isPrinterAddress(host, port)) return null;
  const roles = (Array.isArray(r.roles) ? r.roles : []).filter((x): x is PrinterRole => x === "kitchen" || x === "receipt");
  const width = r.width === 42 || r.width === 32 ? r.width : 48;
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
    storeId: typeof r.storeId === "string" && /^[a-z0-9]{10,40}$/i.test(r.storeId) ? r.storeId : null,
    categories: parseCategories(r.categories),
  };
}

function parseCategories(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = [...new Set(raw.filter((x): x is string => typeof x === "string" && /^[a-z0-9_-]{1,40}$/i.test(x)))].slice(0, 100);
  return ids.length ? ids : null; // ninguna marcada = todo
}

// ─── Comandas por categoría ────────────────────────────────────────────────
type KitchenLine = { quantity: number; productName: string; productId: string; modifiers: unknown; note: string | null };
type Mod = { groupCode?: string; option?: string };
// covered: categorías que tiene alguna impresora de comandas (null si alguna lo imprime todo).
// Lo que no tiene impresora (una categoría nueva, un producto sin categoría) sale en todas: mejor repetido que perdido.
export type LineCategories = { byProduct: Map<string, string>; byName: Map<string, string>; covered?: Set<string> | null };

export function coverage(printers: Printer[]): Set<string> | null {
  if (printers.some((p) => !p.categories)) return null;
  return new Set(printers.flatMap((p) => p.categories ?? []));
}

// El producto de cada paso de un menú se guarda como «Nombre (detalles)». El
// nombre también puede llevar paréntesis («Pionono casero (1 ud.)»): se prueba
// el texto entero y sin el último paréntesis.
const comboCandidates = (option: string) => [option.trim(), option.replace(/\s*\([^()]*\)\s*$/, "").trim()];
const modsOf = (l: { modifiers: unknown }): Mod[] => (Array.isArray(l.modifiers) ? (l.modifiers as Mod[]) : []);

// Categoría de cada producto de las líneas (y de lo elegido dentro de los menús).
export async function lineCategories(tenantId: string, lines: { productId: string; modifiers: unknown }[]): Promise<LineCategories> {
  const ids = [...new Set(lines.map((l) => l.productId).filter((id) => id !== FREE_CATEGORY))];
  const names = [...new Set(lines.flatMap((l) => modsOf(l).filter((m) => m.groupCode === "COMBO" && m.option).flatMap((m) => comboCandidates(m.option!))))];
  const [byId, byNameRows] = await Promise.all([
    ids.length ? prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, categoryId: true } }) : Promise.resolve([]),
    names.length ? prisma.product.findMany({ where: { tenantId, name: { in: names } }, select: { name: true, categoryId: true } }) : Promise.resolve([]),
  ]);
  return { byProduct: new Map(byId.map((p) => [p.id, p.categoryId])), byName: new Map(byNameRows.map((p) => [p.name, p.categoryId])) };
}

// Lo que le toca a una impresora: las líneas de sus categorías. De un menú, los
// pasos de sus categorías (la bebida del menú va a la barra; el mollete, a cocina).
export function linesForPrinter<T extends KitchenLine>(lines: T[], p: Printer, cats: LineCategories): T[] {
  if (!p.categories) return lines;
  const mine = new Set(p.categories);
  const orphan = (c: string) => cats.covered != null && !cats.covered.has(c);
  const takes = (c: string) => mine.has(c) || orphan(c);
  const out: T[] = [];
  for (const l of lines) {
    if (l.productId === FREE_CATEGORY) {
      if (takes(FREE_CATEGORY)) out.push(l);
      continue;
    }
    const cat = cats.byProduct.get(l.productId) ?? "";
    const steps = modsOf(l).filter((m) => m.groupCode === "COMBO" && m.option);
    if (!steps.length) {
      if (takes(cat)) out.push(l);
      continue;
    }
    // Menú: cada paso a la impresora de su categoría. Entero solo si la impresora
    // tiene la categoría del menú y ninguna de las de sus pasos.
    const stepCat = (option: string) => comboCandidates(option).map((n) => cats.byName.get(n)).find(Boolean) ?? "";
    const picked = steps.filter((m) => takes(stepCat(m.option!)));
    if (picked.length) out.push({ ...l, modifiers: picked });
    else if (mine.has(cat) || (orphan(cat) && steps.every((m) => orphan(stepCat(m.option!))))) out.push(l);
  }
  return out;
}

export const newAgentToken = () => randomBytes(24).toString("base64url");

const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";
const hhmm = (d: Date, tz: string) => new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
const dmy = (d: Date, tz: string) => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz }).format(d);

type OrderForPrint = Prisma.OrderGetPayload<{ include: { items: true; invoices: true; table: { select: { name: true } }; tenant: { select: { name: true; slug: true; settings: true } }; store: { select: { name: true; address: true; phone: true } } } }>;

const PAYMENT_LABEL: Record<string, string> = { CASH: "efectivo", CARD_TERMINAL: "datáfono", BIZUM: "Bizum", CARD: "tarjeta online", IN_STORE: "al recoger" };
const modeOf = (o: OrderForPrint) => (o.table ? `MESA ${o.table.name}` : o.channel === "DELIVERY" ? "A DOMICILIO" : o.dineIn ? "COMER AQUÍ" : "PARA LLEVAR");
const sourceOf = (o: OrderForPrint) => (o.source === "TABLE" ? "Sala" : o.source === "COUNTER" ? "Mostrador" : o.source === "PHONE" ? "Teléfono" : "Online");
const isTable = (o: OrderForPrint) => o.source === "TABLE";

// Comanda para cocina: grande y sin precios.
// Mesas: `round` imprime solo esa ronda; `voided` imprime una anulación.
export type KitchenOpts = { round?: number; voided?: KitchenLine[]; lines?: KitchenLine[] };
export function renderKitchen(o: OrderForPrint, p: Printer, opts: KitchenOpts = {}): Uint8Array {
  const tz = tenantTimeZone(o.tenant.settings);
  const t = new Escpos({ width: p.width, codepage: p.codepage });
  if (o.table) {
    t.align("center").bold(true).size(2, 2).line(`MESA ${o.table.name}`).size(1, 1).bold(false);
    if (opts.voided) t.bold(true).size(1, 2).line("*** ANULADO ***").size(1, 1).bold(false);
    else if (opts.round) t.bold(true).size(1, 2).line(`Ronda ${opts.round}`).size(1, 1).bold(false);
    t.line(`${hhmm(new Date(), tz)} · Cuenta nº ${o.orderNumber ?? "?"}${o.guests ? ` · ${o.guests} pax` : ""}`);
    t.align("left").rule("=");
    const items = opts.voided ?? opts.lines ?? (opts.round ? o.items.filter((l) => l.round === opts.round) : o.items);
    for (const l of items) {
      t.bold(true).size(1, 2).wrap(`${l.quantity}x ${l.productName}`).size(1, 1).bold(false);
      for (const m of modifierLabels(l.modifiers)) t.wrap(m, { indent: 3 });
      if (l.note) t.bold(true).wrap(`>> ${l.note}`, { indent: 3 }).bold(false);
    }
    t.rule();
    if (opts.voided) t.align("center").bold(true).line("NO PREPARAR").bold(false);
    t.cut();
    return t.bytes();
  }
  t.align("center").bold(true).size(2, 2).line(`Nº ${o.orderNumber ?? "?"}`).size(1, 1).bold(false);
  t.line(`${hhmm(o.createdAt, tz)} · ${sourceOf(o)}`);
  t.bold(true).size(1, 2).line(modeOf(o)).size(1, 1).bold(false);
  if (o.scheduledFor) t.bold(true).line(`PROGRAMADO: ${dmy(o.scheduledFor, tz)} ${hhmm(o.scheduledFor, tz)}`).bold(false);
  t.align("left").rule("=");
  if (o.customerName && !["Mostrador", "Teléfono"].includes(o.customerName)) t.line(`Cliente: ${o.customerName}${o.customerPhone ? ` · ${o.customerPhone}` : ""}`);
  if (o.channel === "DELIVERY" && o.customerAddress) t.wrap(`Dirección: ${o.customerAddress}`);
  t.rule();
  for (const l of opts.lines ?? o.items) {
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
export function renderReceipt(o: OrderForPrint, p: Printer, opts: { drawer?: boolean } = {}): Uint8Array {
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
  // Mesas: la cuenta antes de cobrar no es una factura.
  if (isTable(o) && o.paymentStatus !== "PAID") t.align("center").bold(true).size(1, 2).line("CUENTA").size(1, 1).line("No es una factura").bold(false).align("left").rule();
  t.bold(true).row(`${isTable(o) ? "Cuenta" : "Pedido"} nº ${o.orderNumber ?? "?"}`, `${dmy(o.createdAt, tz)} ${hhmm(o.createdAt, tz)}`).bold(false);
  t.line(o.table ? `Mesa ${o.table.name}${o.guests ? ` · ${o.guests} comensales` : ""}` : `${modeOf(o).charAt(0)}${modeOf(o).slice(1).toLowerCase()} · ${sourceOf(o)}`);
  if (o.customerName && !["Mostrador", "Teléfono"].includes(o.customerName) && !isTable(o)) t.line(`Cliente: ${o.customerName}`);
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
    // Pago mixto: parte en efectivo y el resto con datáfono o Bizum.
    const cashPart = o.paymentMethod !== "CASH" && o.cashPartCents > 0 ? o.cashPartCents : 0;
    if (cashPart) {
      t.line("Pagado · mixto");
      t.row("Efectivo", euros(cashPart));
      t.row(PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod, euros(o.totalCents - cashPart));
    } else t.line(`Pagado · ${PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}`);
    const cashDue = o.paymentMethod === "CASH" ? o.totalCents : cashPart;
    if (cashDue && o.cashTenderedCents != null && o.cashTenderedCents >= cashDue) {
      t.row("Entregado", euros(o.cashTenderedCents));
      t.row("Cambio", euros(o.cashTenderedCents - cashDue));
    }
  } else t.bold(true).line(isTable(o) ? "PENDIENTE DE PAGO" : `PENDIENTE DE PAGO · ${PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}`).bold(false);
  t.rule();
  if (invoice) {
    // QR de cotejo de la AEAT; con VERI*FACTU, la leyenda obligatoria.
    t.align("center").qr(invoice.qrUrl, p.width === 32 ? 4 : 6).feed(1);
    if (invoice.mode === "VERIFACTU") t.bold(true).line("VERI*FACTU").bold(false).line("Factura verificable en la sede");
    if (invoice.mode === "VERIFACTU") t.line("electrónica de la AEAT");
    t.rule();
  }
  t.align("center").line(isTable(o) ? "¡Gracias por tu visita!" : "¡Gracias por tu pedido!");
  const origin = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  if (origin) t.line(`Pide online: ${origin.replace(/^https?:\/\//, "")}/pedir/${o.tenant.slug}`);
  // El cajón solo se abre al cobrar, nunca al reimprimir un ticket.
  if (opts.drawer !== false && p.drawer && (o.paymentMethod === "CASH" || o.cashPartCents > 0) && o.paymentStatus === "PAID") t.drawer();
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
    include: { items: { orderBy: { createdAt: "asc" } }, invoices: true, table: { select: { name: true } }, tenant: { select: { name: true, slug: true, settings: true } }, store: { select: { name: true, address: true, phone: true } } },
  });
}

// Encola la comanda y/o el ticket de un pedido en las impresoras con ese uso.
export async function enqueueOrderPrints(orderId: string, kinds: ("KITCHEN" | "RECEIPT")[], opts: { reprint?: boolean } = {}): Promise<number> {
  const o = await loadOrder(orderId);
  if (!o) return 0;
  const cfg = readPrinting(o.tenant.settings);
  if (!cfg.agentToken || !cfg.printers.length) return 0;
  const jobs: Prisma.PrintJobCreateManyInput[] = [];
  const cats = kinds.includes("KITCHEN") && cfg.printers.some((x) => x.categories) ? await lineCategories(o.tenantId, o.items) : null;
  if (cats) cats.covered = coverage(cfg.printers.filter((x) => x.roles.includes("kitchen") && (!x.storeId || x.storeId === o.storeId)));
  for (const kind of kinds) {
    const role: PrinterRole = kind === "KITCHEN" ? "kitchen" : "receipt";
    // Cada pedido, a las impresoras de su local (o a las que no tienen local).
    for (const p of cfg.printers.filter((x) => x.roles.includes(role) && (!x.storeId || x.storeId === o.storeId))) {
      // Comanda: solo lo de las categorías de esta impresora (si no le toca nada, no se imprime).
      const lines = kind === "KITCHEN" && cats ? linesForPrinter(o.items, p, cats) : null;
      if (lines && !lines.length) continue;
      const data = kind === "KITCHEN" ? renderKitchen(o, p, lines ? { lines } : {}) : renderReceipt(o, p, { drawer: !opts.reprint });
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

// Mesas: comanda de una ronda o de una anulación (impresoras de comandas) y la
// cuenta antes de cobrar (impresoras de tickets, sin abrir el cajón).
export async function enqueueTablePrint(orderId: string, what: { kind: "ROUND"; round: number } | { kind: "VOID"; lines: NonNullable<KitchenOpts["voided"]> } | { kind: "BILL" }): Promise<number> {
  try {
    const o = await loadOrder(orderId);
    if (!o) return 0;
    const cfg = readPrinting(o.tenant.settings);
    if (!cfg.agentToken || !cfg.printers.length) return 0;
    const role: PrinterRole = what.kind === "BILL" ? "receipt" : "kitchen";
    const jobs: Prisma.PrintJobCreateManyInput[] = [];
    const base = what.kind === "ROUND" ? o.items.filter((l) => l.round === what.round) : what.kind === "VOID" ? what.lines : [];
    const cats = what.kind !== "BILL" && cfg.printers.some((x) => x.categories) ? await lineCategories(o.tenantId, base) : null;
    if (cats) cats.covered = coverage(cfg.printers.filter((x) => x.roles.includes("kitchen") && (!x.storeId || x.storeId === o.storeId)));
    for (const p of cfg.printers.filter((x) => x.roles.includes(role) && (!x.storeId || x.storeId === o.storeId))) {
      const lines = what.kind !== "BILL" && cats ? linesForPrinter(base, p, cats) : base;
      if (what.kind !== "BILL" && !lines.length) continue; // a esta impresora no le toca nada de la ronda
      const data = what.kind === "BILL" ? renderReceipt(o, p, { drawer: false }) : renderKitchen(o, p, what.kind === "ROUND" ? { round: what.round, lines } : { voided: lines });
      const copies = what.kind === "BILL" ? 1 : p.copies;
      for (let i = 0; i < copies; i++) jobs.push({ tenantId: o.tenantId, orderId: o.id, kind: (what.kind === "BILL" ? "RECEIPT" : "KITCHEN") as PrintKind, printerId: p.id, host: p.host, port: p.port, data: Buffer.from(data) });
    }
    if (jobs.length) await prisma.printJob.createMany({ data: jobs });
    return jobs.length;
  } catch (err) {
    console.error("[enqueueTablePrint]", err instanceof Error ? err.message : err);
    return 0;
  }
}

// Mesas: al cobrar, el ticket (factura simplificada) si se imprime solo al cobrar.
export async function printTablePayment(orderId: string): Promise<void> {
  try {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { tenant: { select: { settings: true } } } });
    if (o && readPrinting(o.tenant.settings).autoReceipt) await enqueueOrderPrints(orderId, ["RECEIPT"]);
  } catch (err) {
    console.error("[printTablePayment]", err instanceof Error ? err.message : err);
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
    countedCashCents: number | null; // null en el cierre parcial (no se cuenta)
    expectedCashCents: number;
    differenceCents: number | null;
    summary: { orders: number; byPayment: Record<string, number>; totalCents: number; inCents: number; outCents: number };
    notes: string | null;
    partial?: boolean; // cierre parcial (informe X): las cifras hasta ahora, sin cerrar la caja
    storeName: string;
    tenantName: string;
    tz: string;
  },
  p: Printer
): Uint8Array {
  const t = new Escpos({ width: p.width, codepage: p.codepage });
  t.align("center").bold(true).size(2, 2).line(c.partial ? "CIERRE PARCIAL" : "CIERRE DE CAJA").size(1, 1).bold(false);
  if (c.partial) t.line("La caja sigue abierta");
  t.line(c.tenantName).line(c.storeName);
  t.align("left").rule();
  t.row("Apertura", `${dmy(c.openedAt, c.tz)} ${hhmm(c.openedAt, c.tz)}`);
  if (c.openedByName) t.row("  por", c.openedByName);
  t.row(c.partial ? "Hasta" : "Cierre", `${dmy(c.closedAt, c.tz)} ${hhmm(c.closedAt, c.tz)}`);
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
  if (c.countedCashCents != null && c.differenceCents != null) {
    t.row("Contado", euros(c.countedCashCents));
    t.bold(true).size(1, 2).row(c.differenceCents === 0 ? "Cuadra" : c.differenceCents > 0 ? "Sobra" : "Falta", euros(Math.abs(c.differenceCents))).size(1, 1).bold(false);
  }
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
  const printers = cfg.agentToken ? cfg.printers.filter((x) => x.roles.includes("receipt") && (!x.storeId || x.storeId === s.storeId)) : [];
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

// Cierre parcial (informe X): las ventas y el efectivo esperado hasta ahora, sin
// cerrar la caja. Devuelve en cuántas impresoras sale.
export async function enqueuePartialClosing(
  s: { tenantId: string; storeId: string; openedAt: Date; openedByName: string | null; openingFloatCents: number },
  fig: { orders: number; byPayment: Record<string, number>; totalCents: number; inCents: number; outCents: number; expectedCashCents: number },
  byName: string | null
): Promise<number> {
  const [tenant, store] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: s.tenantId }, select: { name: true, settings: true } }),
    prisma.store.findUnique({ where: { id: s.storeId }, select: { name: true } }),
  ]);
  if (!tenant) return 0;
  const cfg = readPrinting(tenant.settings);
  const printers = cfg.agentToken ? cfg.printers.filter((x) => x.roles.includes("receipt") && (!x.storeId || x.storeId === s.storeId)) : [];
  if (!printers.length) return 0;
  const data = {
    openedAt: s.openedAt,
    closedAt: new Date(),
    openedByName: s.openedByName,
    closedByName: byName,
    openingFloatCents: s.openingFloatCents,
    countedCashCents: null,
    expectedCashCents: fig.expectedCashCents,
    differenceCents: null,
    summary: { orders: fig.orders, byPayment: fig.byPayment, totalCents: fig.totalCents, inCents: fig.inCents, outCents: fig.outCents },
    notes: null,
    storeName: store?.name ?? "",
    tenantName: tenant.name,
    tz: tenantTimeZone(tenant.settings),
    partial: true,
  };
  await prisma.printJob.createMany({ data: printers.map((p) => ({ tenantId: s.tenantId, kind: "CLOSING" as PrintKind, printerId: p.id, host: p.host, port: p.port, data: Buffer.from(renderClosing(data, p)) })) });
  return printers.length;
}
