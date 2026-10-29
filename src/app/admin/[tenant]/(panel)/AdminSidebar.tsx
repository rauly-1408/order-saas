"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import InstallApp from "./InstallApp";
import { forgetOfflinePages } from "./PanelOffline";

// Barra lateral del panel: translúcida con desenfoque (estilo Apple), iconos de
// línea y el elemento activo con el color de la marca del restaurante (--p-brand).

type IconName = "home" | "orders" | "cash" | "tables" | "users" | "partners" | "menu" | "costs" | "chart" | "brush" | "gear" | "files" | "invoice" | "external" | "logout";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    tables: (
      <>
        <rect x="3" y="4" width="7" height="7" rx="1.5" />
        <rect x="14" y="4" width="7" height="7" rx="1.5" />
        <rect x="3" y="15" width="7" height="5" rx="1.5" />
        <circle cx="17.5" cy="17.5" r="2.5" />
      </>
    ),
    cash: (
      <>
        <rect x="3" y="7" width="18" height="11" rx="2" />
        <circle cx="12" cy="12.5" r="2.5" />
        <path d="M7 4h10M3 18h18" />
      </>
    ),
    orders: (
      <>
        <path d="M6 4h12l1 4H5z" />
        <path d="M5 8h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
        <path d="M9 12h6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.4c1.9.8 3 2.8 3 5.6" />
      </>
    ),
    // Colaboradores: dos manos (trato)
    partners: (
      <>
        <path d="M3 11l4-4 4 2 3-2 4 1 3 3" />
        <path d="M7 7l-4 4 6 6 2-2M14 7l5 5-6 6-2-2" />
        <path d="M9 13l2 2M11 11l2 2" />
      </>
    ),
    menu: (
      <>
        <path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    costs: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    chart: <path d="M3 3v17a1 1 0 0 0 1 1h17M7 15l4-4 3 3 6-6" />,
    invoice: (
      <>
        <path d="M6 3h9l4 4v14l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V4a1 1 0 0 1 1-1z" />
        <path d="M9 9h6M9 13h6" />
      </>
    ),
    files: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="M21 16l-5-5-8 9" />
      </>
    ),
    brush: (
      <>
        <path d="M14 4l6 6-8.5 8.5a3 3 0 0 1-4.2 0l-1.8-1.8a3 3 0 0 1 0-4.2z" />
        <path d="M4 20c0-2 1-3 3-3" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </>
    ),
    external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
    logout: <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  exact?: boolean;
  managerOnly?: boolean; // oculto para STORE_MANAGER
  takingsOnly?: boolean; // solo con el permiso «Ve lo recaudado»
  area?: "pedidos" | "caja" | "mesas" | "facturas"; // pantallas del día a día: según el puesto (lib/roles.ts)
  group: string; // apartado del menú: así se encuentra cada cosa por lo que es
};

function buildNav(tenant: string): NavItem[] {
  const base = `/admin/${tenant}`;
  return [
    // El día a día del servicio, en el orden en que se usa
    { label: "Inicio", href: `${base}/home`, icon: "home", exact: true, managerOnly: true, group: "" },
    { label: "Caja", href: `${base}/caja`, icon: "cash", area: "caja", group: "Día a día" },
    { label: "Pedidos", href: `${base}/pedidos`, icon: "orders", area: "pedidos", group: "Día a día" },
    { label: "Mesas", href: `${base}/mesas`, icon: "tables", area: "mesas", group: "Día a día" },
    { label: "Facturas", href: `${base}/facturas`, icon: "invoice", area: "facturas", group: "Día a día" },
    // Lo que se vende y cómo se enseña
    { label: "Carta", href: `${base}/carta`, icon: "menu", managerOnly: true, group: "Tu carta" },
    { label: "Archivos", href: `${base}/archivos`, icon: "files", managerOnly: true, group: "Tu carta" },
    // Quién compra y quién trae clientes
    { label: "Clientes", href: `${base}/clientes`, icon: "users", managerOnly: true, group: "Clientes" },
    { label: "Colaboradores", href: `${base}/colaboradores`, icon: "partners", managerOnly: true, group: "Clientes" },
    // Los números del negocio
    { label: "Informes", href: `${base}/informes`, icon: "chart", managerOnly: true, takingsOnly: true, group: "Números" },
    { label: "Costes", href: `${base}/costes`, icon: "costs", managerOnly: true, group: "Números" },
  ];
}

export default function AdminSidebar({
  tenant,
  tenantName,
  logoUrl,
  canManage,
  seesTakings = false,
  areas = { pedidos: true, caja: true, mesas: true, facturas: true },
}: {
  tenant: string;
  tenantName: string;
  logoUrl: string | null;
  canManage: boolean;
  seesTakings?: boolean;
  areas?: Record<"pedidos" | "caja" | "mesas" | "facturas", boolean>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = buildNav(tenant).filter((item) => (canManage || !item.managerOnly) && (seesTakings || !item.takingsOnly) && (!item.area || areas[item.area]));
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    forgetOfflinePages();
    router.replace(`/admin/${tenant}/login`);
  }

  // Configuración va a pantalla completa (como Shopify): sin barra lateral.
  const inSettings = pathname.startsWith(`/admin/${tenant}/configuracion`);

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));

  const brandMark = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt={tenantName} className="h-9 w-9 rounded-xl object-contain" />
  ) : (
    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--p-brand)] text-sm font-semibold text-white">
      {tenantName.charAt(0).toUpperCase()}
    </div>
  );

  if (inSettings) return null;
  return (
    <>
      {/* Móvil: barra superior translúcida con botón de menú */}
      <div className="p-glass fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--p-line)] px-4 lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Abrir menú" className="p-press flex h-9 w-9 items-center justify-center rounded-full text-[var(--p-ink)] hover:bg-black/5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <span className="text-[15px] font-semibold">{tenantName}</span>
      </div>

      {open && <button aria-label="Cerrar menú" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px] lg:hidden" />}

      {/* Escritorio: barra fija. Móvil: panel deslizante. */}
      <aside
        className={`p-glass fixed inset-y-0 left-0 z-50 flex h-screen w-64 min-w-64 flex-col border-r border-[var(--p-line)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          {brandMark}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{tenantName}</div>
            <div className="text-xs text-[var(--p-muted)]">Panel del restaurante</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3">
          <ul>
            {nav.map((item, i) => {
              const active = isActive(item);
              const heading = item.group && item.group !== nav[i - 1]?.group ? item.group : null;
              return (
                <li key={item.href}>
                  {heading && <p className="px-3 pt-2.5 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--p-accent)]">{heading}</p>}
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`p-press flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] ${
                      active ? "bg-[var(--p-brand)] font-medium text-white shadow-sm" : "text-[var(--p-ink)] hover:bg-black/[0.04]"
                    }`}
                  >
                    <span className={active ? "text-white" : "text-[var(--p-muted)]"}>
                      <Icon name={item.icon} />
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-[var(--p-line)] px-3 py-2">
          {/* Configuración abajo, separada del trabajo diario (como Shopify) */}
          {canManage && (
            <Link
              href={`/admin/${tenant}/configuracion`}
              onClick={() => setOpen(false)}
              className={`p-press flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] ${
                pathname.startsWith(`/admin/${tenant}/configuracion`) ? "bg-[var(--p-brand)] font-medium text-white shadow-sm" : "text-[var(--p-ink)] hover:bg-black/[0.04]"
              }`}
            >
              <span className={pathname.startsWith(`/admin/${tenant}/configuracion`) ? "text-white" : "text-[var(--p-muted)]"}>
                <Icon name="gear" />
              </span>
              Configuración
            </Link>
          )}
          <InstallApp className="p-press flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[13px] font-medium text-[var(--p-brand)] hover:bg-black/[0.04]" />
          <Link href={`/pedir/${tenant}`} target="_blank" className="p-press flex items-center gap-3 rounded-xl px-3 py-1.5 text-[13px] text-[var(--p-muted)] hover:bg-black/[0.04]">
            <Icon name="external" />
            Ver carta pública
          </Link>
          <Link
            href={`/admin/${tenant}/cuenta`}
            onClick={() => setOpen(false)}
            className={`p-press flex items-center gap-3 rounded-xl px-3 py-1.5 text-[13px] hover:bg-black/[0.04] ${pathname.startsWith(`/admin/${tenant}/cuenta`) ? "font-medium text-[var(--p-ink)]" : "text-[var(--p-muted)]"}`}
          >
            <Icon name="users" />
            Mi cuenta
          </Link>
          <button onClick={handleLogout} className="p-press flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-left text-[13px] text-[var(--p-muted)] hover:bg-black/[0.04]">
            <Icon name="logout" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
