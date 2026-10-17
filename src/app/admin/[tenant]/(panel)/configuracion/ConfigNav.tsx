"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const CONFIG_SECTIONS = [
  { slug: "negocio", label: "Información del negocio", icon: "🏪" },
  { slug: "pagos", label: "Pagos", icon: "💳" },
  { slug: "entrega", label: "Envío y entrega", icon: "🛵" },
  { slug: "horario", label: "Horario y zonas", icon: "🕐" },
] as const;

// Menú de apartados: columna fija en escritorio, fila deslizante en el móvil.
export default function ConfigNav({ tenant }: { tenant: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Apartados de configuración" className="-mx-4 mb-6 overflow-x-auto px-4 lg:sticky lg:top-6 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0">
      <ul className="flex w-max gap-1 rounded-2xl bg-[var(--p-surface)] p-1.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] lg:w-auto lg:flex-col">
        {CONFIG_SECTIONS.map((s) => {
          const href = `/admin/${tenant}/configuracion/${s.slug}`;
          const active = pathname.startsWith(href);
          return (
            <li key={s.slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`p-press flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm ${active ? "bg-[var(--p-brand-soft)] font-semibold text-[var(--p-brand-strong)]" : "text-[var(--p-ink)] hover:bg-black/[0.04]"}`}
              >
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
