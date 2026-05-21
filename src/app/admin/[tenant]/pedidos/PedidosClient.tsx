"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const S = {
  white: '#ffffff', pageBg: '#f7f7fb', border: '#eaeaf4',
  purple: '#7939fe', purpleDark: '#5707fd', purpleLight: '#e0d1ff', purpleMid: '#9c6dfe',
  textDark: '#393659', textMid: '#b8b6df', green: '#1ade92', red: '#ff5e6c',
};

const fmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const toEuros = (c: number) => fmt.format(c / 100);

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + ' min';
  return Math.floor(s / 3600) + ' h';
}

type OItem = { id: string; productName: string; quantity: number; lineTotalCents: number };
type Order = {
  id: string; status: string; channel: string; customerName: string;
  customerPhone: string; customerAddress: string | null; notes: string | null;
  totalCents: number; createdAt: string; items: OItem[];
};

const STATUS_COLOR: Record<string, string> = {
  CREATED: '#f59e0b', ACCEPTED: S.purpleMid, PREPARING: '#f97316',
  READY: S.green, DELIVERED: S.textMid, CANCELLED: S.red,
};
const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Nuevo', ACCEPTED: 'Aceptado', PREPARING: 'Preparando',
  READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado',
};
const STATUS_NEXT: Record<string, string | null> = {
  CREATED: 'ACCEPTED', ACCEPTED: 'PREPARING', PREPARING: 'READY',
  READY: 'DELIVERED', DELIVERED: null, CANCELLED: null,
};
const STATUS_BTN: Record<string, string> = {
  CREATED: 'Aceptar', ACCEPTED: 'En preparación', PREPARING: 'Listo', READY: 'Entregado',
};

function OrderRow({ order, updating, onStatus }: {
  order: Order; updating: string | null; onStatus: (id: string, s: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const busy = updating === order.id;
  const nextStatus = STATUS_NEXT[order.status];
  const isNew = Date.now() - new Date(order.createdAt).getTime() < 120_000;

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', borderBottom: `1px solid ${S.border}`, background: expanded ? '#faf9ff' : S.white, transition: 'background 0.15s' }}
      >
        <td style={{ padding: '14px 16px', width: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[order.status] ?? S.textMid, display: 'inline-block' }} />
        </td>
        <td style={{ padding: '14px 16px', fontSize: 12, fontFamily: 'monospace', color: S.textMid }}>
          #{order.id.slice(0, 6).toUpperCase()}
          {isNew && <span style={{ marginLeft: 8, background: S.purpleLight, color: S.purpleDark, fontSize: 10, fontWeight: 700, borderRadius: 9999, padding: '2px 6px' }}>NUEVO</span>}
        </td>
        <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 500, color: S.textDark }}>{order.customerName}</td>
        <td style={{ padding: '14px 16px', fontSize: 13, color: S.textDark }}>{order.customerPhone}</td>
        <td style={{ padding: '14px 16px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: S.textDark }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[order.status], display: 'inline-block' }} />
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
        </td>
        <td style={{ padding: '14px 16px', fontSize: 13, color: S.textDark }}>{order.channel === 'DELIVERY' ? '🛵 Delivery' : '🏪 Recogida'}</td>
        <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: S.textDark }}>{toEuros(order.totalCents)}</td>
        <td style={{ padding: '14px 16px', fontSize: 12, color: S.textMid }}>{timeAgo(order.createdAt)}</td>
        <td style={{ padding: '14px 16px' }}>
          {nextStatus && STATUS_BTN[order.status] && (
            <button
              disabled={busy}
              onClick={(e) => { e.stopPropagation(); onStatus(order.id, nextStatus); }}
              style={{ background: S.purpleLight, color: S.purpleDark, border: `1px solid ${S.purpleMid}`, borderRadius: 4, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
            >
              {busy ? '...' : STATUS_BTN[order.status]}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: '#faf9ff', borderBottom: `1px solid ${S.border}` }}>
          <td colSpan={9} style={{ padding: '0 16px 16px 48px' }}>
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.textMid, marginBottom: 8 }}>Productos</div>
                {order.items.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 32, fontSize: 13, color: S.textDark, marginBottom: 4 }}>
                    <span>{item.quantity}x {item.productName}</span>
                    <span style={{ fontWeight: 600 }}>{toEuros(item.lineTotalCents)}</span>
                  </div>
                ))}
              </div>
              {order.customerAddress && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.textMid, marginBottom: 8 }}>Dirección</div>
                  <div style={{ fontSize: 13, color: S.textDark }}>{order.customerAddress}</div>
                </div>
              )}
              {order.notes && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: S.textMid, marginBottom: 8 }}>Notas</div>
                  <div style={{ fontSize: 13, color: S.textDark, fontStyle: 'italic' }}>{order.notes}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PedidosClient({ tenant }: { tenant: string }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'done'>('active');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${tenant}?active=1`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setOrders(data.orders ?? []);
      setError(null);
    } catch (e: unknown) {
      setError('Error cargando pedidos: ' + (e instanceof Error ? e.message : 'desconocido'));
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchOrders();
    pollRef.current = setInterval(fetchOrders, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOrders]);

  const handleStatus = useCallback(async (orderId: string, nextStatus: string) => {
    setUpdating(orderId);
    try {
      await fetch(`/api/orders/status/${orderId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      await fetchOrders();
    } finally { setUpdating(null); }
  }, [fetchOrders]);

  const active = orders.filter(o => !['DELIVERED', 'CANCELLED'].includes(o.status));
  const done = orders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status));
  const shown = filter === 'active' ? active : done;

  const thStyle: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.08em', color: S.textDark, background: S.pageBg, textAlign: 'left',
    borderBottom: `1px solid ${S.border}`,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: S.textDark, margin: 0 }}>Pedidos</h1>
          <div style={{ fontSize: 13, color: S.textMid, marginTop: 4 }}>Actualización automática cada 10 segundos</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: S.pageBg, borderRadius: 6, padding: 4 }}>
          {(['active', 'done'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '6px 14px', fontSize: 13, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: filter === f ? S.white : 'transparent',
              color: filter === f ? S.purpleDark : S.textMid,
              fontWeight: filter === f ? 600 : 400, fontFamily: 'inherit',
              boxShadow: filter === f ? `0 1px 3px ${S.border}` : 'none', transition: 'all 0.15s',
            }}>
              {f === 'active' ? `Activos (${active.length})` : `Completados (${done.length})`}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fff0f0', border: `1px solid ${S.red}`, borderRadius: 8, padding: 12, color: S.red, fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      <div style={{ background: S.white, border: `1px solid ${S.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: S.textMid, fontSize: 14 }}>Cargando pedidos...</div>
        ) : shown.length === 0 ? (
          <div style={{ padding: 64, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: S.textDark, marginBottom: 4 }}>
              {filter === 'active' ? 'Sin pedidos activos' : 'Sin pedidos completados'}
            </div>
            <div style={{ fontSize: 13, color: S.textMid }}>Los pedidos nuevos aparecerán aquí automáticamente</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['', '#', 'Cliente', 'Teléfono', 'Estado', 'Canal', 'Total', 'Hace', 'Acción'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map(o => (
                <OrderRow key={o.id} order={o} updating={updating} onStatus={handleStatus} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
