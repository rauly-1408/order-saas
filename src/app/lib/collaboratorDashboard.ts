import { prisma } from "./prisma";
import { tenantTimeZone } from "./time";
import { COUNTED, addMonths, monthOf, monthStart } from "./collaborators";

// Lo que ve un colaborador en su app (/colaborador/[token]): lo de este mes,
// los meses anteriores y sus pedidos, sin datos de clientes. Lo usan la página
// y la consulta que la refresca sola. Ver docs/COLABORADORES.md

export type DashboardMonth = { month: string; count: number; totalCents: number; earnedCents: number; paidAt: string | null };
export type CollaboratorDashboard = {
  name: string;
  code: string;
  commissionPct: number;
  active: boolean;
  tenantName: string;
  tenantSlug: string;
  timeZone: string;
  months: DashboardMonth[]; // del actual hacia atrás (6)
  orders: { id: string; at: string; number: number | null; totalCents: number; earnedCents: number }[]; // este mes
};

export async function collaboratorDashboard(token: string): Promise<CollaboratorDashboard | null> {
  if (!/^[\w-]{10,64}$/.test(token)) return null;
  const c = await prisma.collaborator.findUnique({ where: { token }, select: { id: true, name: true, code: true, commissionPct: true, active: true, tenantId: true } });
  if (!c) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: c.tenantId }, select: { name: true, slug: true, settings: true } });
  if (!tenant) return null;
  const tz = tenantTimeZone(tenant.settings);
  const current = monthOf(new Date(), tz);
  const [orders, payouts] = await Promise.all([
    prisma.order.findMany({
      where: { collaboratorId: c.id, createdAt: { gte: monthStart(addMonths(current, -5), tz) }, ...COUNTED },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, orderNumber: true, totalCents: true, commissionCents: true },
    }),
    prisma.collaboratorPayout.findMany({ where: { collaboratorId: c.id }, select: { month: true, paidAt: true } }),
  ]);
  const paidOf = new Map(payouts.map((p) => [p.month, p.paidAt.toISOString()]));
  const months = Array.from({ length: 6 }, (_, i) => addMonths(current, -i)).map((m): DashboardMonth => {
    const from = monthStart(m, tz);
    const to = monthStart(addMonths(m, 1), tz);
    const list = orders.filter((o) => o.createdAt >= from && o.createdAt < to);
    return { month: m, count: list.length, totalCents: list.reduce((a, o) => a + o.totalCents, 0), earnedCents: list.reduce((a, o) => a + o.commissionCents, 0), paidAt: paidOf.get(m) ?? null };
  });
  const startCurrent = monthStart(current, tz);
  return {
    name: c.name,
    code: c.code,
    commissionPct: c.commissionPct,
    active: c.active,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    timeZone: tz,
    months,
    orders: orders.filter((o) => o.createdAt >= startCurrent).map((o) => ({ id: o.id, at: o.createdAt.toISOString(), number: o.orderNumber, totalCents: o.totalCents, earnedCents: o.commissionCents })),
  };
}
