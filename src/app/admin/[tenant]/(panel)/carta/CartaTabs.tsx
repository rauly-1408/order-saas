"use client";

import { useState } from "react";
import CartaClient from "./CartaClient";
import Combos from "./Combos";

// Carta: productos sueltos y combos / menús a precio cerrado.
export default function CartaTabs({ tenant }: { tenant: string }) {
  const [tab, setTab] = useState<"productos" | "combos">("productos");
  return (
    <div className="text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Carta</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Tus productos y los menús a precio cerrado</p>
      <nav className="mt-6 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1">
        {(
          [
            ["productos", "Productos"],
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
      {tab === "productos" ? <CartaClient tenant={tenant} embedded /> : <Combos tenant={tenant} />}
    </div>
  );
}
