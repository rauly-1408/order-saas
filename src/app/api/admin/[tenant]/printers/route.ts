import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { listStores } from "@/app/lib/stores";
import { enqueueTest, newAgentToken, parsePrinter, readPrinting, type Printer } from "@/app/lib/printing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Impresoras. Ver docs/IMPRESION.md
//   GET  → configuración, estado del agente y últimos trabajos
//   PUT  { printers, autoKitchen, autoReceipt } → guarda
//   POST { action: "test", printerId } | { action: "newToken" }

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

async function payload(tenantId: string, settings: unknown) {
  const cfg = readPrinting(settings);
  const [pending, recent] = await Promise.all([
    prisma.printJob.count({ where: { tenantId, status: "PENDING" } }),
    prisma.printJob.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 8, select: { id: true, kind: true, status: true, printerId: true, error: true, createdAt: true, printedAt: true, orderId: true } }),
  ]);
  const seen = cfg.agentSeenAt ? Date.parse(cfg.agentSeenAt) : 0;
  const stores = (await listStores(tenantId)).map((s) => ({ id: s.id, name: s.name }));
  // Categorías de la carta para repartir las comandas (cocina / barra)
  const categories = await prisma.category.findMany({ where: { tenantId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return { ...cfg, agentOnline: Date.now() - seen < 3 * 60_000, pending, recent, stores, categories };
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json(await payload(c.tenant.id, c.tenant.settings));
}

export async function PUT(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const raw = Array.isArray(b.printers) ? b.printers : [];
  if (raw.length > 6) return NextResponse.json({ error: "Como mucho 6 impresoras" }, { status: 400 });
  const printers: Printer[] = [];
  for (const r of raw) {
    const p = parsePrinter(r);
    if (!p) return NextResponse.json({ error: "Revisa la impresora: tiene que ser una IP de tu red (192.168.x.x, 10.x.x.x o 172.16–31.x.x) y el puerto 9100 (hasta 9109)" }, { status: 400 });
    printers.push(p);
  }
  const settings = (c.tenant.settings as Record<string, unknown>) ?? {};
  const prev = (settings.printing as Record<string, unknown>) ?? {};
  const printing = {
    ...prev,
    agentToken: typeof prev.agentToken === "string" ? prev.agentToken : newAgentToken(),
    autoKitchen: b.autoKitchen !== false,
    autoReceipt: b.autoReceipt !== false,
    printers,
  };
  const next = { ...settings, printing };
  await prisma.tenant.update({ where: { id: c.tenant.id }, data: { settings: next as object } });
  return NextResponse.json(await payload(c.tenant.id, next));
}

export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const settings = (c.tenant.settings as Record<string, unknown>) ?? {};
  if (b.action === "newToken") {
    const printing = { ...((settings.printing as Record<string, unknown>) ?? {}), agentToken: newAgentToken(), agentSeenAt: null };
    const next = { ...settings, printing };
    await prisma.tenant.update({ where: { id: c.tenant.id }, data: { settings: next as object } });
    return NextResponse.json(await payload(c.tenant.id, next));
  }
  if (b.action === "test") {
    const cfg = readPrinting(settings);
    if (!cfg.agentToken) return NextResponse.json({ error: "Guarda primero la configuración" }, { status: 400 });
    const p = cfg.printers.find((x) => x.id === b.printerId);
    if (!p) return NextResponse.json({ error: "Impresora no encontrada" }, { status: 404 });
    await enqueueTest(c.tenant.id, c.tenant.name, p);
    return NextResponse.json(await payload(c.tenant.id, settings));
  }
  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
