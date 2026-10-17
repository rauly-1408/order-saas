import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { asProvider } from "@/app/lib/couriers";
import { openSecrets, sealSecrets } from "@/app/lib/couriers/secrets";
import { generateGlovoKeys, glovoConfig, glovoToken, missingGlovoSetup } from "@/app/lib/couriers/glovo";
import { CourierError } from "@/app/lib/couriers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración del repartidor externo (Configuración → Envío y entrega).
// Los secretos nunca salen del servidor: solo se dice si existen.

async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenant };
}

async function view(req: NextRequest, tenantId: string, slug: string) {
  const row = await prisma.courierAccount.findUnique({ where: { tenantId } });
  const secrets = openSecrets(row?.secrets);
  const glovo = glovoConfig((row?.config ?? {}) as Record<string, unknown>);
  return {
    provider: asProvider(row?.provider),
    autoRequest: row?.autoRequest ?? true,
    glovo,
    publicKeyPem: row?.publicKeyPem ?? null,
    hasWebhookSecret: !!secrets.webhookSecret,
    missing: missingGlovoSetup(glovo, secrets),
    webhookUrl: `${new URL(req.url).origin}/api/webhooks/couriers/glovo/${slug}`,
  };
}

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json(await view(req, c.tenant.id, c.tenant.slug));
}

// PUT { provider, autoRequest, glovo: { clientId, keyId, scope, env }, webhookSecret? }
// webhookSecret vacío o ausente = se mantiene el que hay.
export async function PUT(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const row = await prisma.courierAccount.findUnique({ where: { tenantId: c.tenant.id } });
  const secrets = openSecrets(row?.secrets);
  const webhookSecret = typeof body.webhookSecret === "string" ? body.webhookSecret.trim() : "";
  if (webhookSecret.length > 500) return NextResponse.json({ error: "El secreto del webhook es demasiado largo" }, { status: 400 });
  if (webhookSecret) secrets.webhookSecret = webhookSecret;
  const data = {
    provider: asProvider(body.provider),
    autoRequest: body.autoRequest !== false,
    config: glovoConfig((body.glovo ?? {}) as Record<string, unknown>),
    secrets: Object.keys(secrets).length ? sealSecrets(secrets) : null,
  };
  await prisma.courierAccount.upsert({ where: { tenantId: c.tenant.id }, create: { tenantId: c.tenant.id, ...data }, update: data });
  return NextResponse.json(await view(req, c.tenant.id, c.tenant.slug));
}

// POST { action: "generateKeys" } → nuevo par de claves (la pública se envía a Glovo).
// POST { action: "test" } → comprueba que Glovo acepta las credenciales.
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const row = await prisma.courierAccount.findUnique({ where: { tenantId: c.tenant.id } });
  const secrets = openSecrets(row?.secrets);

  if (action === "generateKeys") {
    const keys = generateGlovoKeys();
    secrets.privateKeyPem = keys.privateKeyPem;
    const data = { publicKeyPem: keys.publicKeyPem, secrets: sealSecrets(secrets) };
    await prisma.courierAccount.upsert({ where: { tenantId: c.tenant.id }, create: { tenantId: c.tenant.id, ...data }, update: data });
    return NextResponse.json(await view(req, c.tenant.id, c.tenant.slug));
  }

  if (action === "test") {
    try {
      await glovoToken({ tenantId: c.tenant.id, config: (row?.config ?? {}) as Record<string, unknown>, secrets });
      return NextResponse.json({ ok: true, message: "Conexión correcta: Glovo acepta tus credenciales." });
    } catch (err) {
      const message = err instanceof CourierError ? err.message : "No se ha podido conectar con Glovo";
      if (!(err instanceof CourierError)) console.error("[courier test]", err);
      return NextResponse.json({ ok: false, message });
    }
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
