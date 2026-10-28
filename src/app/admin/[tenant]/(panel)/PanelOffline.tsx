"use client";

import { useEffect } from "react";

// Panel sin internet: registra el service worker y le pide que guarde ya las
// pantallas de trabajo (Caja, Mesas y Pedidos) con sus archivos, para que se
// abran aunque se caiga la conexión. Ver docs/SIN-CONEXION.md
export default function PanelOffline({ tenant }: { tenant: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        if (cancelled || !navigator.onLine) return;
        const base = `/admin/${tenant}`;
        reg.active?.postMessage({ type: "warm", urls: [`${base}/caja`, `${base}/mesas`, `${base}/pedidos`] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenant]);
  return null;
}

// Al cerrar sesión: que las pantallas guardadas no se puedan abrir sin entrar.
export function forgetOfflinePages() {
  navigator.serviceWorker?.controller?.postMessage({ type: "logout" });
}
