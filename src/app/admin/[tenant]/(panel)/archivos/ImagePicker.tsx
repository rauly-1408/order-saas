"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import MediaLibrary from "./MediaLibrary";

// Foto de un producto: «Subir imagen» o «Elegir de mis archivos» (biblioteca),
// en vez de pegar una dirección. Lo subido queda guardado en Archivos.
export default function ImagePicker({ tenant, value, onChange }: { tenant: string; value: string; onChange: (url: string) => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-black/[0.05] text-2xl text-[var(--p-faint)]">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden>🖼</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setOpen(true)} className="p-press rounded-full bg-[var(--p-brand)] px-4 py-2 text-sm font-semibold text-white">
            {value ? "Cambiar imagen" : "Añadir imagen"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="p-press rounded-full border border-[var(--p-line)] px-4 py-2 text-sm font-medium">
              Quitar
            </button>
          )}
        </div>
      </div>

      {/* Se pinta en .panel (colores y fuentes del panel), fuera de .p-page: la
          animación de entrada de la página atrapa los «fixed» y la ventana
          quedaba dentro del contenido, fuera de la pantalla. */}
      {open &&
        createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Elegir imagen">
          <button aria-label="Cerrar" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[24px] bg-[var(--p-bg)] shadow-2xl sm:rounded-[24px]">
            <header className="flex items-center gap-3 border-b border-[var(--p-line)] px-5 py-4">
              <p className="flex-1 text-[15px] font-semibold">Elige una imagen o sube una nueva</p>
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="h-8 w-8 rounded-full text-xl leading-none text-[var(--p-muted)]">
                ×
              </button>
            </header>
            <div className="overflow-y-auto p-5">
              <MediaLibrary
                tenant={tenant}
                kind="IMAGE"
                pickedUrl={value}
                onPick={(f) => {
                  onChange(f.url);
                  setOpen(false);
                }}
              />
            </div>
          </div>
        </div>,
          document.querySelector(".panel") ?? document.body
        )}
    </div>
  );
}
