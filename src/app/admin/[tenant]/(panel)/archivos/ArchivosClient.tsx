"use client";

import { useState } from "react";
import MediaLibrary from "./MediaLibrary";

// Panel → Archivos: la biblioteca del restaurante, con dos pestañas.
export default function ArchivosClient({ tenant, initialTab }: { tenant: string; initialTab: "imagenes" | "videos" }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="text-[var(--p-ink)]">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Archivos</h1>
      <p className="mt-1 text-sm text-[var(--p-muted)]">Tu biblioteca: las fotos de tus productos y tus vídeos, en un solo sitio</p>
      <nav className="mt-6 mb-6 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-black/[0.05] p-1" aria-label="Tipo de archivo">
        {(
          [
            ["imagenes", "🖼 Imágenes"],
            ["videos", "🎬 Vídeos"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => {
              setTab(k);
              history.replaceState(null, "", `?tipo=${k}`);
            }}
            aria-pressed={tab === k}
            className={`p-press shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${tab === k ? "bg-[var(--p-surface)] text-[var(--p-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]" : "text-[var(--p-muted)] hover:text-[var(--p-ink)]"}`}
          >
            {l}
          </button>
        ))}
      </nav>
      <MediaLibrary key={tab} tenant={tenant} kind={tab === "videos" ? "VIDEO" : "IMAGE"} />
    </div>
  );
}
