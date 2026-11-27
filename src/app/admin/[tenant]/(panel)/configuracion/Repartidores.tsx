"use client";

import { toast } from "./ui";

function BikeIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="18.5" cy="17.5" r="3.5" />
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="15" cy="5" r="1" />
      <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
    </svg>
  );
}

export default function Repartidores() {
  return (
    <section className="rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-6 md:col-span-2 md:gap-6 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-2">
            <BikeIcon />
            <h3 className="text-sm font-bold leading-[22px] text-[var(--p-ink)] md:text-xl md:font-semibold md:leading-[26px] md:tracking-tight">
              Repartidores
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toast("La gestión de repartidores todavía no está activada.", false)}
          className="p-press inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2 text-sm font-medium shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
            <path d="M5 12h14" /><path d="M12 5v14" />
          </svg>
          Agregar repartidor
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="text-[var(--p-muted)]">
            <BikeIcon className="h-8 w-8" />
          </div>
          <p className="text-sm font-semibold leading-5 text-[var(--p-ink)]">
            Aún no hay repartidores
          </p>
          <p className="max-w-[17.5rem] text-sm font-normal leading-[1.375rem] text-[var(--p-muted)]">
            Agrega tus repartidores para asignarles pedidos a domicilio e imprimir sus códigos de acceso.
          </p>
        </div>
        <div className="flex flex-row gap-3">
          <button
            type="button"
            disabled
            title="Disponible cuando hayas agregado repartidores"
            className="p-press inline-flex h-10 items-center justify-center rounded-xl border border-[var(--p-line)] bg-[var(--p-surface)] px-4 py-2 text-sm font-medium opacity-50"
          >
            Imprimir códigos
          </button>
        </div>
      </div>
    </section>
  );
}
