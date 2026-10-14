"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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
  managerOnly?: boolean; // oculto para STORE_MANAGER
};

function buildNav(tenant: string): NavItem[] {
  const base = `/admin/${tenant}`;
  return [
    { label: 'Inicio',            href: `${base}/home`,             icon: '⊙', exact: true, managerOnly: true },
    { label: 'Pedidos',           href: `${base}/pedidos`,          icon: '🛒' },
    { label: 'Carta',             href: `${base}/carta`,            icon: '📋', managerOnly: true },
    { label: 'Costes',            href: `${base}/costes`,           icon: '🧮', managerOnly: true },
    { label: 'Personalización',   href: `${base}/personalizacion`,  icon: '🎨', managerOnly: true },
    { label: 'Configuración',     href: `${base}/configuracion`,    icon: '⚙️', managerOnly: true },
  ];
}

export default function AdminSidebar({
  tenant,
  tenantName,
  logoUrl,
  canManage,
}: {
  tenant: string;
  tenantName: string;
  logoUrl: string | null;
  canManage: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = buildNav(tenant).filter((item) => canManage || !item.managerOnly);
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.replace(`/admin/${tenant}/login`);
  }

  function isActive(item: NavItem): boolean {
    if (item.exact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <>
    {/* Móvil: barra superior con botón de menú */}
    <div
      className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 px-4 lg:hidden"
      style={{ background: S.white, borderBottom: `1px solid ${S.border}` }}
    >
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir menú"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-xl"
        style={{ color: S.textDark }}
      >
        ☰
      </button>
      <span style={{ fontSize: 15, fontWeight: 700, color: S.textDark }}>{tenantName}</span>
    </div>

    {open && (
      <button aria-label="Cerrar menú" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/30 lg:hidden" />
    )}

    {/* Escritorio: barra fija. Móvil: panel deslizante. */}
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 min-w-64 flex-col transition-transform lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
      style={{ background: S.white, borderRight: `1px solid ${S.border}` }}
    >
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
                onClick={() => setOpen(false)}
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
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '8px 12px', borderRadius: 9999, border: 'none', background: 'transparent',
            color: S.textMid, fontSize: 13, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span>⎋</span>
          <span>Cerrar sesión</span>
        </button>
      </div>
    </aside>
    </>
  );
}
