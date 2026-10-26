// Avisos en el móvil aunque la app esté cerrada (Web Push). Ver docs/AVISOS-MOVIL.md
// - Panel (dueño/encargado): un ingrediente baja de su mínimo.
// - App del colaborador: entra una venta con su código.
// Las claves VAPID se generan solas la primera vez y se guardan cifradas en la
// base de datos (AppSecret), así no hay que configurar nada en Vercel. Si existen
// VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el entorno, se usan esas.
import webpush from "web-push";
import type { PushAudience } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { seal, unseal } from "@/app/lib/secretBox";
import { COUNTED, monthOf, monthStart } from "@/app/lib/collaborators";
import { DEFAULT_TIMEZONE } from "@/app/lib/time";

type Keys = { publicKey: string; privateKey: string };
let cached: Keys | null = null;

export async function vapidKeys(): Promise<Keys> {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const row = await prisma.appSecret.findUnique({ where: { key: "vapid" } });
  let keys = row ? (unseal(row.value, "vapid") as Partial<Keys>) : {};
  if (!keys.publicKey || !keys.privateKey) {
    const fresh = webpush.generateVAPIDKeys();
    // Si dos peticiones las generan a la vez, gana la primera y la otra la relee.
    const value = seal({ publicKey: fresh.publicKey, privateKey: fresh.privateKey }, "vapid");
    await prisma.appSecret.create({ data: { key: "vapid", value } }).catch((err: { code?: string }) => {
      if (err?.code !== "P2002") throw err; // P2002: otra petición ya las creó
    });
    const saved = await prisma.appSecret.findUniqueOrThrow({ where: { key: "vapid" } });
    keys = unseal(saved.value, "vapid") as Partial<Keys>;
  }
  if (!keys.publicKey || !keys.privateKey) throw new Error("No se pudieron leer las claves de avisos");
  cached = { publicKey: keys.publicKey, privateKey: keys.privateKey };
  return cached;
}

export type SubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } };

// Valida lo que manda el navegador (PushSubscription.toJSON()).
export function parseSubscription(raw: unknown): SubscriptionInput | null {
  const o = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!o || typeof o.endpoint !== "string" || !/^https:\/\//.test(o.endpoint) || o.endpoint.length > 1000) return null;
  const { p256dh, auth } = o.keys ?? {};
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint: o.endpoint, keys: { p256dh, auth } };
}

export async function saveSubscription(sub: SubscriptionInput, who: { tenantId: string; audience: PushAudience; userId?: string | null; collaboratorId?: string | null }) {
  const data = { tenantId: who.tenantId, audience: who.audience, userId: who.userId ?? null, collaboratorId: who.collaboratorId ?? null, p256dh: sub.keys.p256dh, auth: sub.keys.auth };
  await prisma.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
}

export async function removeSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

function origin(): string {
  const v = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  return v || "http://localhost:3000";
}

// Envía a todos los dispositivos que cumplan `where`. Los que ya no existen
// (el usuario quitó el permiso o borró la app) se borran. Nunca lanza.
export async function sendPush(where: { tenantId: string; audience: PushAudience; collaboratorId?: string }, msg: PushMessage): Promise<number> {
  try {
    const subs = await prisma.pushSubscription.findMany({ where });
    if (!subs.length) return 0;
    const keys = await vapidKeys();
    const options = { vapidDetails: { subject: origin().startsWith("https://") ? origin() : "mailto:avisos@example.com", ...keys }, TTL: 60 * 60 * 6, urgency: "high" as const };
    const payload = JSON.stringify(msg);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await removeSubscription(s.endpoint);
          else console.error("[push]", code, err instanceof Error ? err.message : err);
        }
      })
    );
    return sent;
  } catch (err) {
    console.error("[push]", err instanceof Error ? err.message : err);
    return 0;
  }
}

const euros = (c: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(c / 100);

// Venta nueva de un colaborador (ya pagada si era online): «+2,45 € para ti».
export async function notifyCollaboratorSale(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, tenantId: true, collaboratorId: true, commissionCents: true, collaborator: { select: { token: true, active: true } } },
    });
    if (!order?.collaboratorId || !order.collaborator?.active || order.status === "AWAITING_PAYMENT" || order.status === "CANCELLED") return;
    const month = monthOf(new Date(), DEFAULT_TIMEZONE);
    const agg = await prisma.order.aggregate({
      where: { collaboratorId: order.collaboratorId, createdAt: { gte: monthStart(month, DEFAULT_TIMEZONE) }, ...COUNTED },
      _sum: { commissionCents: true },
    });
    await sendPush(
      { tenantId: order.tenantId, audience: "COLLABORATOR", collaboratorId: order.collaboratorId },
      {
        title: `¡Nueva venta! +${euros(order.commissionCents)} para ti`,
        body: `Este mes llevas ${euros(agg._sum.commissionCents ?? 0)}.`,
        url: `/colaborador/${order.collaborator.token}`,
        tag: "venta",
      }
    );
  } catch (err) {
    console.error("[notifyCollaboratorSale]", err instanceof Error ? err.message : err);
  }
}

const UNIT: Record<string, string> = { KG: "kg", G: "g", L: "l", ML: "ml", UNIT: "ud" };
function qty(q: number, unit: string): string {
  const n = (v: number) => v.toLocaleString("es-ES", { maximumFractionDigits: 2 });
  if (unit === "G" && Math.abs(q) >= 1000) return `${n(q / 1000)} kg`;
  if (unit === "ML" && Math.abs(q) >= 1000) return `${n(q / 1000)} l`;
  return `${n(q)} ${UNIT[unit] ?? ""}`.trim();
}

// Ingredientes que acaban de bajar de su mínimo → aviso al panel del dueño.
export async function notifyLowStock(tenantId: string, items: { name: string; stockQty: number; minStock: number; baseUnit: string }[]): Promise<void> {
  if (!items.length) return;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
  if (!tenant) return;
  const first = items[0];
  await sendPush(
    { tenantId, audience: "PANEL" },
    {
      title: items.length === 1 ? `Queda poco: ${first.name}` : `${items.length} ingredientes bajo mínimo`,
      body:
        items.length === 1
          ? `${first.stockQty <= 0 ? "Agotado" : `Quedan ${qty(first.stockQty, first.baseUnit)}`} (mínimo ${qty(first.minStock, first.baseUnit)}).`
          : items.map((i) => i.name).join(", "),
      url: `/admin/${tenant.slug}/costes?tab=compras`,
      tag: "stock",
    }
  );
}
