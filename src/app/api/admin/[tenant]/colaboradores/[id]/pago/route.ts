import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin } from "@/app/lib/auth";
import { tenantTimeZone } from "@/app/lib/time";
import { COUNTED, addMonths, monthOf, monthStart } from "@/app/lib/collaborators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { month } → marca pagado ese mes (lo que se lleva, calculado aquí).
// DELETE ?month= → deshacer. Ver docs/COLABORADORES.md
async function ctx(req: NextRequest) {
  const parts = new URL(req.url).pathname.split("/");
  const id = parts.at(-2) ?? "";
  const slug = parts.at(-4) ?? "";
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true, settings: true } });
  if (!tenant) return { error: NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 }) };
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return { error: denied };
  const c = await prisma.collaborator.findFirst({ where: { id, tenantId: tenant.id }, select: { id: true } });
  if (!c) return { error: NextResponse.json({ error: "Colaborador no encontrado" }, { status: 404 }) };
  return { tenantId: tenant.id, id, tz: tenantTimeZone(tenant.settings) };
}

export async function POST(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const month = typeof b.month === "string" && /^\d{4}-\d{2}$/.test(b.month) ? b.month : null;
  if (!month || month > monthOf(new Date(), c.tz)) return NextResponse.json({ error: "Mes no válido" }, { status: 400 });
  const sum = await prisma.order.aggregate({
    where: { collaboratorId: c.id, createdAt: { gte: monthStart(month, c.tz), lt: monthStart(addMonths(month, 1), c.tz) }, ...COUNTED },
    _sum: { commissionCents: true },
  });
  const amountCents = sum._sum.commissionCents ?? 0;
  const p = await prisma.collaboratorPayout.upsert({
    where: { collaboratorId_month: { collaboratorId: c.id, month } },
    create: { tenantId: c.tenantId, collaboratorId: c.id, month, amountCents },
    update: { amountCents, paidAt: new Date() },
  });
  return NextResponse.json({ ok: true, amountCents: p.amountCents });
}

export async function DELETE(req: NextRequest) {
  const c = await ctx(req);
  if ("error" in c) return c.error;
  const month = new URL(req.url).searchParams.get("month") ?? "";
  await prisma.collaboratorPayout.deleteMany({ where: { collaboratorId: c.id, month } });
  return NextResponse.json({ ok: true });
}
