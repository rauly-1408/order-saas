"use client";

import { useState } from "react";
import CartaClient from "./CartaClient";
import Combos from "./Combos";
import Opciones from "./Opciones";
import CartasDelivery from "./CartasDelivery";
import Link from "next/link";
import { useTabFromUrl } from "../useTabFromUrl";

const TAB_KEYS = ["productos", "opciones", "combos", "delivery"] as const;

// Carta: productos sueltos, opciones (pan, extras…) y combos / menús a precio cerrado.
export default function CartaTabs({ tenant }: { tenant: string }) {
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>("productos");
  useTabFromUrl(TAB_KEYS, setTab); // ?tab=opciones o un enlace de NORA
  return (
    <div className="text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Carta</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Tus productos, sus opciones y los menús a precio cerrado</p>
      <nav aria-label="Secciones de carta" className="mt-6 mb-6 grid w-full grid-cols-2 gap-2 sm:flex sm:w-fit sm:flex-wrap">
        {(
          [
            ["productos", "Productos"],
            ["opciones", "Opciones"],
            ["combos", "Combos y menús"],
            ["delivery", "Cartas delivery"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={`p-press flex min-h-12 w-full items-center justify-center rounded-full px-3 py-2 text-center text-sm font-semibold leading-tight transition-colors duration-200 sm:w-auto sm:px-5 ${tab === k ? "bg-[var(--p-brand)] text-white shadow-sm" : "border border-[var(--p-line)] bg-[var(--p-surface)] text-[var(--p-ink)] hover:bg-black/[0.04]"}`}
          >
            {l}
          </button>
        ))}
      </nav>
      {/* La traducción de la carta está en Configuración → Idiomas (como Shopify) */}
      <Link href={`/admin/${tenant}/configuracion/idiomas`} className="-mt-3 mb-3 inline-flex min-h-11 items-center text-xs font-medium text-[var(--p-brand)]">
        🌐 Carta en inglés → Configuración · Idiomas
      </Link>
      {tab === "productos" ? <CartaClient tenant={tenant} embedded /> : tab === "opciones" ? <Opciones tenant={tenant} /> : tab === "combos" ? <Combos tenant={tenant} /> : <CartasDelivery tenant={tenant} />}
    </div>
  );
}
