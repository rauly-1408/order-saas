import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { retentionTenant } from "@/app/lib/retentionApi";
import { SEGMENTS, type Segment } from "@/app/lib/retention";
import { aiConfigured, AiCopyError, draftCampaignMessages } from "@/app/lib/aiCopy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_LIMIT = 30;
const TOP_DISHES_DAYS = 60;

// Límite diario por restaurante (por instancia del servidor: suficiente para
// frenar abusos; si hiciera falta exactitud se movería a la base de datos).
const usage = new Map<string, { day: string; count: number }>();

function takeQuota(tenantId: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(tenantId);
  if (!u || u.day !== day) {
    usage.set(tenantId, { day, count: 1 });
    return true;
  }
  if (u.count >= DAILY_LIMIT) return false;
  u.count++;
  return true;
}

// POST { segment, coupon: { code, label } | null, idea?: string } → { variants: string[] }
export async function POST(req: NextRequest) {
  const ctx = await retentionTenant(req);
  if ("error" in ctx) return ctx.error;
  if (!aiConfigured()) return NextResponse.json({ error: "La redacción con IA no está activada todavía." }, { status: 503 });

  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (!SEGMENTS.includes(b.segment as Segment)) return NextResponse.json({ error: "Elige a quién va dirigida" }, { status: 400 });
  const c = b.coupon as { code?: unknown; label?: unknown } | null | undefined;
  const coupon =
    c && typeof c.code === "string" && c.code.trim() && typeof c.label === "string"
      ? { code: c.code.trim().slice(0, 20), label: c.label.trim().slice(0, 20) }
      : null;
  const idea = typeof b.idea === "string" && b.idea.trim() ? b.idea.trim().slice(0, 200) : null;

  if (!takeQuota(ctx.tenant.id)) {
    return NextResponse.json({ error: `Has llegado al máximo de ${DAILY_LIMIT} redacciones de hoy.` }, { status: 429 });
  }

  // Platos más pedidos últimamente: dan al mensaje algo concreto y real.
  const since = new Date(Date.now() - TOP_DISHES_DAYS * 86_400_000);
  const top = await prisma.orderLine.groupBy({
    by: ["productName"],
    where: { order: { tenantId: ctx.tenant.id, createdAt: { gte: since }, status: { notIn: ["CANCELLED", "AWAITING_PAYMENT"] } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 5,
  });

  try {
    const variants = await draftCampaignMessages({
      restaurant: ctx.tenant.name,
      segment: b.segment as Segment,
      coupon,
      topDishes: top.map((t) => t.productName),
      idea,
    });
    return NextResponse.json({ variants });
  } catch (err) {
    if (err instanceof AiCopyError) return NextResponse.json({ error: err.message }, { status: 502 });
    console.error("[POST retention/ai-message]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
