import { prisma } from "@/app/lib/prisma";

const S = { textDark: '#393659', textMid: '#b8b6df', white: '#ffffff', border: '#eaeaf4', purple: '#7939fe', purpleLight: '#e0d1ff', purpleDark: '#5707fd', green: '#1ade92' };

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8, padding: '20px 24px', flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.textMid, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: S.textDark }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: S.textMid, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default async function AdminHomePage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;

  const tenantData = await prisma.tenant.findUnique({
    where: { slug: tenant },
    select: { id: true, name: true },
  });

  if (!tenantData) {
    return <div style={{ color: '#ff5e6c', padding: 32 }}>Tenant no encontrado: {tenant}</div>;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalOrders, activeOrders, products, categories] = await Promise.all([
    prisma.order.count({ where: { tenantId: tenantData.id, createdAt: { gte: today } } }),
    prisma.order.count({ where: {
      tenantId: tenantData.id,
      status: { notIn: ['DELIVERED', 'CANCELLED'] },
    }}),
    prisma.product.count({ where: { tenantId: tenantData.id, isActive: true } }),
    prisma.category.count({ where: { tenantId: tenantData.id, isActive: true } }),
  ]);

  const revenueResult = await prisma.order.aggregate({
    where: { tenantId: tenantData.id, createdAt: { gte: today }, status: { notIn: ['CANCELLED'] } },
    _sum: { totalCents: true },
  });

  const revenueCents = revenueResult._sum.totalCents ?? 0;
  const revenueFormatted = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(revenueCents / 100);

  const recentOrders = await prisma.order.findMany({
    where: { tenantId: tenantData.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, orderNumber: true, customerName: true, status: true, totalCents: true, channel: true, createdAt: true },
  });

  const STATUS_COLOR: Record<string, string> = {
    CREATED: '#f59e0b', ACCEPTED: S.purple, PREPARING: '#f97316',
    READY: S.green, DELIVERED: S.textMid, CANCELLED: '#ff5e6c',
  };
  const STATUS_LABEL: Record<string, string> = {
    CREATED: 'Nuevo', ACCEPTED: 'Aceptado', PREPARING: 'Preparando',
    READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado',
  };
  const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: S.textDark, margin: 0 }}>Hoy en {tenantData.name}</h1>
        <div style={{ fontSize: 13, color: S.textMid, marginTop: 4 }}>
          Última actualización: {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <StatCard label="Ingresos hoy" value={revenueFormatted} />
        <StatCard label="Pedidos hoy" value={totalOrders} />
        <StatCard label="Pedidos activos" value={activeOrders} sub="En preparación o pendientes" />
        <StatCard label="Productos activos" value={products} sub={`${categories} categorías`} />
      </div>

      <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8 }}>
        <div style={{ padding: '16px 24px', borderBottom: `1px solid ${S.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.textDark }}>
            Últimos pedidos
          </div>
        </div>
        {recentOrders.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: S.textMid, fontSize: 14 }}>Sin pedidos aún</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fafafa' }}>
                {['#', 'Cliente', 'Estado', 'Canal', 'Total'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: S.textDark, textAlign: 'left', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(o => (
                <tr key={o.id} style={{ borderBottom: `1px solid ${S.border}` }}>
                  <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace', color: S.textMid }}>#{o.orderNumber}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, color: S.textDark }}>{o.customerName}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[o.status] ?? S.textMid, display: 'inline-block' }} />
                      <span style={{ color: S.textDark }}>{STATUS_LABEL[o.status] ?? o.status}</span>
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: S.textDark }}>{o.channel === 'DELIVERY' ? '🛵 Delivery' : '🏪 Recogida'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 700, color: S.textDark }}>{fmt.format(o.totalCents / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
