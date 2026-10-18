"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConfigIcon from "./ConfigIcon";
import { CONFIG_SECTIONS } from "./sections";

// Menú de Configuración como el de Shopify: tarjeta de la tienda arriba y la
// lista de apartados. En el móvil, la lista es la portada de Configuración y
// cada apartado tiene «← Configuración» para volver.
export default function ConfigNav({ tenant, name, logoUrl, storeUrl }: { tenant: string; name: string; logoUrl: string | null; storeUrl: string }) {
  const pathname = usePathname();
  const base = `/admin/${tenant}/configuracion`;
  const onIndex = pathname === base || pathname === `${base}/`;
  return (
    <>
      {!onIndex && (
        <Link href={base} className="p-press mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--p-muted)] lg:hidden">
          <span aria-hidden>←</span> Configuración
        </Link>
      )}
      <nav aria-label="Apartados de configuración" className={`${onIndex ? "block" : "hidden"} lg:sticky lg:top-20 lg:block`}>
        <div className="overflow-hidden rounded-2xl bg-[var(--p-surface)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {/* Tarjeta de la tienda */}
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 border-b border-[var(--p-line)] bg-black/[0.02] px-4 py-3.5 hover:bg-black/[0.04]">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--p-brand)] text-sm font-semibold text-white">{name.slice(0, 2).toUpperCase()}</span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold">{name}</span>
              <span className="block truncate text-xs text-[var(--p-muted)]">{storeUrl.replace(/^https?:\/\//, "")}</span>
            </span>
          </a>
          <ul className="p-1.5">
            {CONFIG_SECTIONS.map((s) => {
              const href = `${base}/${s.slug}`;
              const active = pathname.startsWith(href);
              return (
                <li key={s.slug}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`p-press flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] lg:py-2 ${active ? "bg-black/[0.06] font-semibold text-[var(--p-ink)]" : "text-[var(--p-ink)] hover:bg-black/[0.04]"}`}
                  >
                    <ConfigIcon name={s.icon} className={active ? "text-[var(--p-ink)]" : "text-[var(--p-muted)]"} />
                    <span className="flex-1">{s.label}</span>
                    <span aria-hidden className="text-[var(--p-faint)] lg:hidden">›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}
