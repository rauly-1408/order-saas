"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import CajaClient from "./caja/CajaClient";

// «＋ Nuevo pedido» sin salir de la página (Pedidos o Caja): la pantalla de
// tomar pedidos se abre encima, dejando el menú lateral a la vista, y se
// cierra con «✕ Cerrar» o Esc. Mientras está abierta, <html> lleva la clase
// «pedido-abierto» (la burbuja de NORA se esconde para no tapar «Cobrar»).
export type NewOrderProps = { canSeeTakings: boolean; canDiscount: boolean; canCounter: boolean; canPhone: boolean };

const noop = () => () => {};

export default function NewOrder({ tenant, startPhone = false, onClose, ...p }: NewOrderProps & { tenant: string; startPhone?: boolean; onClose: () => void }) {
  // Se pinta en .panel (fuera de .p-page): la animación de entrada de la página encierra lo «fixed».
  const host = useSyncExternalStore(noop, () => document.querySelector<HTMLElement>(".panel"), () => null);
  useEffect(() => {
    document.documentElement.classList.add("pedido-abierto");
    const onKey = (e: KeyboardEvent) => {
      // Esc cierra solo si no hay otra ventana encima (opciones, cobro…).
      if (e.key === "Escape" && !document.querySelector('.pedido-abierto [data-new-order] [aria-modal="true"]')) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.classList.remove("pedido-abierto");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!host) return null;
  return createPortal(
    <div data-new-order role="dialog" aria-label="Nuevo pedido" className="p-pop fixed inset-0 z-30 bg-[var(--p-bg)] lg:left-64 lg:[.menu-mini_&]:left-[4.5rem]">
      {/* Mismo hueco que el contenido del panel (main), para que la pantalla de pedido encaje igual */}
      <div className="h-full overflow-y-auto px-4 pt-20 pb-12 lg:px-10 lg:pt-10">
        <CajaClient tenant={tenant} {...p} startPhone={startPhone} onClose={onClose} />
      </div>
    </div>,
    host
  );
}
