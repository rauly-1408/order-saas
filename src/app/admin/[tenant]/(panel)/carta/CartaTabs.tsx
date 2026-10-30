"use client";

import { useState } from "react";
import CartaClient from "./CartaClient";
import Combos from "./Combos";
import Opciones from "./Opciones";
import Link from "next/link";

// Carta: productos sueltos, opciones (pan, extras…) y combos / menús a precio cerrado.
export default function CartaTabs({ tenant }: { tenant: string }) {
  const [tab, setTab] = useState<"productos" | "opciones" | "combos">("productos");
  return (
    <div className="text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Carta</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Tus productos, sus opciones y los menús a precio cerrado</p>
      <nav className="mt-6 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1">
        {(
          [
            ["productos", "Productos"],
            ["opciones", "Opciones"],
            ["combos", "Combos y menús"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`p-press shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${tab === k ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)] hover:text-[var(--p-ink)]"}`}
          >
            {l}
          </button>
        ))}
      </nav>
      {/* La traducción de la carta está en Configuración → Idiomas (como Shopify) */}
      <Link href={`/admin/${tenant}/configuracion/idiomas`} className="-mt-3 mb-3 inline-flex min-h-11 items-center text-xs font-medium text-[var(--p-brand)]">
        🌐 Carta en inglés → Configuración · Idiomas
      </Link>
      {tab === "productos" ? <CartaClient tenant={tenant} embedded /> : tab === "opciones" ? <Opciones tenant={tenant} /> : <Combos tenant={tenant} />}
    </div>
  );
}
