"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Ventanas del panel (hojas, avisos, detalles): siempre se pintan en .panel,
// fuera de .p-page. La animación de entrada de la página pone un «transform» y
// todo lo «fixed» de dentro queda encerrado en ella: la ventana no se centra en
// la pantalla y el fondo oscuro no la cubre entera. Usar SIEMPRE esto para
// cualquier ventana con «fixed inset-0».
const noop = () => () => {};

export default function PanelPortal({ children }: { children: React.ReactNode }) {
  const host = useSyncExternalStore(noop, () => document.querySelector<HTMLElement>(".panel") ?? document.body, () => null);
  return host ? createPortal(children, host) : null;
}
