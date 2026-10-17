import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { seal, unseal } from "@/app/lib/secretBox";
import { asGateway, SECRETS_PURPOSE } from "@/app/lib/gateways";
import { redsysConfig, redsysProblem } from "@/app/lib/gateways/redsys";
import { stripeCheck, stripeMode } from "@/app/lib/gateways/stripe";
import { GatewayError } from "@/app/lib/gateways/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Pagos: la pasarela del restaurante (como Shopify, cada uno
// conecta la suya). Las claves nunca salen del servidor: solo se dice si hay.

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, platformFeeBps: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

async function view(req: NextRequest, t: { id: string; slug: string; platformFeeBps: number }) {
  const row = await prisma.paymentAccount.findUnique({ where: { tenantId: t.id } });
  const secrets = unseal(row?.secrets, SECRETS_PURPOSE);
  const redsys = redsysConfig((row?.config ?? {}) as Record<string, unknown>);
  // Comisión de la plataforma de este mes (se factura aparte, como Shopify).
  const month = await prisma.order.aggregate({
    where: { tenantId: t.id, paymentStatus: "PAID", paidAt: { gte: startOfMonth() } },
    _count: true,
    _sum: { totalCents: true, applicationFeeCents: true },
  });
  return {
    provider: asGateway(row?.provider),
    payInStore: row?.payInStore ?? true,
    bizum: row?.bizum ?? false,
    redsys,
    hasRedsysKey: !!secrets.redsysKey,
    stripe: { mode: stripeMode(secrets.stripeKey), hasWebhookSecret: !!secrets.stripeWebhook },
    notifyUrl: `${new URL(req.url).origin}/api/webhooks/payments/${t.slug}`,
    feePercent: t.platformFeeBps / 100,
    month: { orders: month._count, totalCents: month._sum.totalCents ?? 0, feeCents: month._sum.applicationFeeCents ?? 0 },
  };
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json(await view(req, c.tenant));
}

// PUT { provider, payInStore, bizum, redsys: { merchantCode, terminal, env }, redsysKey?, stripeKey?, stripeWebhook? }
// Las claves vacías o ausentes se mantienen.
export async function PUT(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = await prisma.paymentAccount.findUnique({ where: { tenantId: c.tenant.id } });
  const secrets = unseal(row?.secrets, SECRETS_PURPOSE);
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  for (const k of ["redsysKey", "stripeKey", "stripeWebhook"]) {
    const v = str(k);
    if (v.length > 300) return NextResponse.json({ error: "Clave demasiado larga" }, { status: 400 });
    if (v) secrets[k] = v;
  }
  if (str("stripeKey") && !stripeMode(str("stripeKey"))) return NextResponse.json({ error: "La clave de Stripe empieza por sk_test_ o sk_live_" }, { status: 400 });

  const provider = asGateway(body.provider);
  const redsys = redsysConfig((body.redsys ?? {}) as Record<string, unknown>);
  if (provider === "REDSYS") {
    const problem = redsysProblem(redsys, secrets.redsysKey);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  if (provider === "STRIPE" && !secrets.stripeKey) return NextResponse.json({ error: "Pega la clave secreta de Stripe" }, { status: 400 });
  const payInStore = provider === "NONE" ? true : body.payInStore !== false;

  const data = {
    provider,
    payInStore,
    bizum: provider === "REDSYS" && body.bizum === true,
    config: redsys,
    secrets: Object.keys(secrets).length ? seal(secrets, SECRETS_PURPOSE) : null,
  };
  await prisma.paymentAccount.upsert({ where: { tenantId: c.tenant.id }, create: { tenantId: c.tenant.id, ...data }, update: data });
  return NextResponse.json(await view(req, c.tenant));
}

// POST { action: "test" } → comprueba la clave de Stripe (Redsys se valida al guardar).
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const row = await prisma.paymentAccount.findUnique({ where: { tenantId: c.tenant.id } });
  const secrets = unseal(row?.secrets, SECRETS_PURPOSE);
  try {
    await stripeCheck({ tenantId: c.tenant.id, config: {}, secrets: { secretKey: secrets.stripeKey ?? "" } });
    return NextResponse.json({ ok: true, message: `Conexión correcta con Stripe (${stripeMode(secrets.stripeKey) === "live" ? "modo real" : "modo prueba"}).` });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof GatewayError ? err.message : "No se ha podido conectar con Stripe" });
  }
}
