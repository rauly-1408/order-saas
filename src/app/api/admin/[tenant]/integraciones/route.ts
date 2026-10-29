import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { activePartners, parsePartners } from "@/app/lib/deliveryPartners";
import { readPrinting } from "@/app/lib/printing";
import { readVerifactu } from "@/app/lib/verifactu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Integraciones: en qué estado está cada conexión del
// restaurante (GET) y «Solicitar» las que aún no están (POST { request }).
// Las solicitudes se guardan en Tenant.settings.integrationRequests para saber
// cuántos restaurantes piden cada una. Ver docs/INTEGRACIONES.md

const REQUESTABLE = ["glovo", "ubereats", "justeat"] as const;
type Requestable = (typeof REQUESTABLE)[number];
const AGENT_ONLINE_MS = 5 * 60_000;

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

function readRequests(settings: unknown): Partial<Record<Requestable, string>> {
  const raw = ((settings ?? {}) as Record<string, unknown>).integrationRequests as Record<string, unknown> | undefined;
  const out: Partial<Record<Requestable, string>> = {};
  for (const k of REQUESTABLE) if (typeof raw?.[k] === "string") out[k] = raw[k] as string;
  return out;
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const { tenant } = c;
  const [payment, courier] = await Promise.all([
    prisma.paymentAccount.findUnique({ where: { tenantId: tenant.id }, select: { provider: true, bizum: true } }),
    prisma.courierAccount.findUnique({ where: { tenantId: tenant.id }, select: { provider: true, autoRequest: true } }),
  ]);
  const printing = readPrinting(tenant.settings);
  const agentSeen = printing.agentSeenAt ? Date.parse(printing.agentSeenAt) : 0;
  return NextResponse.json({
    payments: { provider: payment?.provider ?? "NONE", bizum: Boolean(payment?.bizum) },
    courier: { provider: courier?.provider ?? "NONE", autoRequest: courier?.autoRequest ?? false },
    partnerLinks: activePartners(parsePartners((tenant.settings as Record<string, unknown> | null)?.deliveryPartners)).map((p) => p.label),
    printers: { count: printing.printers.length, agentOnline: agentSeen > 0 && Date.now() - agentSeen < AGENT_ONLINE_MS, agentSeenAt: printing.agentSeenAt },
    verifactu: { enabled: readVerifactu(tenant.settings).enabled },
    requests: readRequests(tenant.settings),
  });
}

export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const { tenant } = c;
  const b = (await req.json().catch(() => ({}))) as { request?: unknown };
  const key = REQUESTABLE.find((k) => k === b.request);
  if (!key) return NextResponse.json({ error: "Integración no válida" }, { status: 400 });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const requests = { ...readRequests(settings), [key]: readRequests(settings)[key] ?? new Date().toISOString() };
  await prisma.tenant.update({ where: { id: tenant.id }, data: { settings: { ...settings, integrationRequests: requests } as Prisma.InputJsonValue } });
  return NextResponse.json({ requests });
}
