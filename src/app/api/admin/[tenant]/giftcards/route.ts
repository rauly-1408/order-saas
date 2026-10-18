import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { newGiftCode } from "@/app/lib/giftCards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Configuración → Tarjetas regalo. Ver docs/CONFIGURACION.md
async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const slug = parts[parts.indexOf("admin") + 1];
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  return { tenantId: tenant.id };
}

const list = (tenantId: string) =>
  prisma.giftCard.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, code: true, initialCents: true, balanceCents: true, active: true, expiresAt: true, note: true, createdAt: true, _count: { select: { orders: true } } },
  });

export async function GET(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  return NextResponse.json({ cards: await list(c.tenantId) });
}

// POST { amountCents, note?, expiresAt? (YYYY-MM-DD) } → nueva tarjeta con código único.
export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = Number(b.amountCents);
  if (!Number.isInteger(amount) || amount < 100 || amount > 100_000) return NextResponse.json({ error: "El importe tiene que estar entre 1 € y 1.000 €" }, { status: 400 });
  const expiresAt = typeof b.expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt) ? new Date(`${b.expiresAt}T23:59:59`) : null;
  if (expiresAt && expiresAt < new Date()) return NextResponse.json({ error: "La caducidad tiene que ser futura" }, { status: 400 });
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 120) || null : null;
  for (let i = 0; i < 5; i++) {
    try {
      const card = await prisma.giftCard.create({ data: { tenantId: c.tenantId, code: newGiftCode(), initialCents: amount, balanceCents: amount, expiresAt, note } });
      return NextResponse.json({ cards: await list(c.tenantId), created: card.code });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  return NextResponse.json({ error: "No se pudo crear la tarjeta. Inténtalo de nuevo." }, { status: 500 });
}

// PATCH { id, active } → desactivar / reactivar.
export async function PATCH(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.active !== "boolean") return NextResponse.json({ error: "Datos no válidos" }, { status: 400 });
  const r = await prisma.giftCard.updateMany({ where: { id: b.id, tenantId: c.tenantId }, data: { active: b.active } });
  if (!r.count) return NextResponse.json({ error: "Tarjeta no encontrada" }, { status: 404 });
  return NextResponse.json({ cards: await list(c.tenantId) });
}
