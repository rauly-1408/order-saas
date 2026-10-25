import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { denyUnlessTenantAdmin, getSessionFromRequest } from "@/app/lib/auth";
import { tenantTimeZone } from "@/app/lib/time";
import { COUNTED, addMonths, monthOf, monthStart, newCollabToken, parseCollaborator } from "@/app/lib/collaborators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Colaboradores del restaurante. GET ?month=AAAA-MM → cada uno con sus pedidos,
// ventas y lo que se lleva ese mes, y si ya se le pagó. GET ?lite=1 → solo
// nombre y código (para la Caja, cualquier usuario). POST → nuevo. Ver docs/COLABORADORES.md

async function tenantOf(req: NextRequest) {
  const slug = new URL(req.url).pathname.split("/").at(-2) ?? "";
  return prisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true, settings: true } });
}

export async function GET(req: NextRequest) {
  const tenant = await tenantOf(req);
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const url = new URL(req.url);
  if (url.searchParams.get("lite")) {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (session.role !== "SUPERADMIN" && session.tenantId !== tenant.id) return NextResponse.json({ error: "Prohibido" }, { status: 403 });
    const list = await prisma.collaborator.findMany({ where: { tenantId: tenant.id, active: true }, orderBy: { name: "asc" }, select: { name: true, place: true, code: true } });
    return NextResponse.json({ collaborators: list });
  }
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  const tz = tenantTimeZone(tenant.settings);
  const current = monthOf(new Date(), tz);
  const m = url.searchParams.get("month");
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : current;
  const from = monthStart(month, tz);
  const to = monthStart(addMonths(month, 1), tz);
  const [list, stats, payouts, pending] = await Promise.all([
    prisma.collaborator.findMany({ where: { tenantId: tenant.id }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    prisma.order.groupBy({
      by: ["collaboratorId"],
      where: { tenantId: tenant.id, collaboratorId: { not: null }, createdAt: { gte: from, lt: to }, ...COUNTED },
      _count: { _all: true },
      _sum: { totalCents: true, commissionCents: true },
    }),
    prisma.collaboratorPayout.findMany({ where: { tenantId: tenant.id, month }, select: { collaboratorId: true, amountCents: true, paidAt: true } }),
    // Lo que se les debe de meses anteriores sin pagar (para no olvidarlo).
    prisma.order.groupBy({
      by: ["collaboratorId"],
      where: { tenantId: tenant.id, collaboratorId: { not: null }, createdAt: { lt: from }, ...COUNTED },
      _sum: { commissionCents: true },
    }),
  ]);
  const paidBefore = await prisma.collaboratorPayout.groupBy({ by: ["collaboratorId"], where: { tenantId: tenant.id, month: { lt: month } }, _sum: { amountCents: true } });
  const byId = new Map(stats.map((s) => [s.collaboratorId, s]));
  const payoutOf = new Map(payouts.map((p) => [p.collaboratorId, p]));
  const owedBefore = new Map(pending.map((p) => [p.collaboratorId, p._sum.commissionCents ?? 0]));
  const paidBeforeOf = new Map(paidBefore.map((p) => [p.collaboratorId, p._sum.amountCents ?? 0]));
  return NextResponse.json({
    month,
    currentMonth: current,
    collaborators: list.map((c) => {
      const s = byId.get(c.id);
      return {
        id: c.id,
        name: c.name,
        place: c.place,
        phone: c.phone,
        code: c.code,
        commissionPct: c.commissionPct,
        token: c.token,
        active: c.active,
        notes: c.notes,
        orders: s?._count._all ?? 0,
        salesCents: s?._sum.totalCents ?? 0,
        commissionCents: s?._sum.commissionCents ?? 0,
        paid: payoutOf.get(c.id) ?? null,
        pendingBeforeCents: Math.max(0, (owedBefore.get(c.id) ?? 0) - (paidBeforeOf.get(c.id) ?? 0)),
      };
    }),
  });
}

export async function POST(req: NextRequest) {
  const tenant = await tenantOf(req);
  if (!tenant) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  const denied = await denyUnlessTenantAdmin(req, tenant.id);
  if (denied) return denied;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const input = parseCollaborator(b);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });
  const taken = await prisma.collaborator.findFirst({ where: { tenantId: tenant.id, code: input.code }, select: { id: true } });
  if (taken) return NextResponse.json({ error: "Ese código ya lo tiene otro colaborador" }, { status: 409 });
  const c = await prisma.collaborator.create({ data: { tenantId: tenant.id, ...input, token: newCollabToken() }, select: { id: true } });
  return NextResponse.json({ id: c.id }, { status: 201 });
}
