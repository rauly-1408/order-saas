"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Last.app-inspired design tokens — system level, no tenant hardcoding
const S = {
  white:       '#ffffff',
  pageBg:      '#f7f7fb',
  border:      '#eaeaf4',
  purple:      '#7939fe',
  purpleDark:  '#5707fd',
  purpleLight: '#e0d1ff',
  textDark:    '#393659',
  textMid:     '#b8b6df',
};

type NavItem = {
  label: string;
  href: string;
  icon: string;
  exact?: boolean;
};

function buildNav(tenant: string): NavItem[] {
  const base = `/admin/${tenant}`;
  return [
    { label: 'Inicio',            href: `${base}/home`,             icon: '⊙', exact: true },
    { label: 'Pedidos',           href: `${base}/pedidos`,          icon: '🛒' },
    { label: 'Carta',             href: `${base}/carta`,            icon: '📋' },
    { label: 'Personalización',   href: `${base}/personalizacion`,  icon: '🎨' },
    { label: 'Configuración',     href: `${base}/configuracion`,    icon: '⚙️' },
  ];
}

export default function AdminSidebar({
  tenant,
  tenantName,
  logoUrl,
}: {
  tenant: string;
  tenantName: string;
  logoUrl: string | null;
}) {
  const pathname = usePathname();
  const nav = buildNav(tenant);

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <aside style={{
      width: 256, minWidth: 256, background: S.white,
      borderRight: `1px solid ${S.border}`, display: 'flex',
      flexDirection: 'column', height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '20px 16px 16px', borderBottom: `1px solid ${S.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {logoUrl ? (
            <img src={logoUrl} alt={tenantName} style={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 6 }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: 6, background: S.purpleLight,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: S.purpleDark,
            }}>
              {tenantName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: S.textDark, lineHeight: 1.2 }}>{tenantName}</div>
            <div style={{ fontSize: 11, color: S.textMid }}>Panel de administración</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {nav.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 9999,
                  textDecoration: 'none', transition: 'all 0.15s',
                  background: active ? S.pageBg : 'transparent',
                  color: active ? S.purpleDark : S.textDark,
                  fontWeight: active ? 600 : 400,
                  fontSize: 14,
                }}
              >
                <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer: link to public menu */}
      <div style={{ padding: '12px 8px', borderTop: `1px solid ${S.border}` }}>
        <Link
          href={`/pedir/${tenant}`}
          target="_blank"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 9999, textDecoration: 'none',
            color: S.textMid, fontSize: 13, transition: 'all 0.15s',
          }}
        >
          <span>↗</span>
          <span>Ver carta pública</span>
        </Link>
      </div>
    </aside>
  );
}
