"use client";

import { useEffect, useState } from "react";

// Conexión: los errores de red del navegador («Failed to fetch», «Load failed»)
// llegaban en inglés a la pantalla. Aquí se traducen en un solo sitio para toda
// la web, y mientras no hay internet se muestra un aviso fijo («Sin conexión»),
// para que en sala se sepa antes de enviar una ronda o cobrar.

type Fetch = typeof window.fetch & { __friendly?: boolean };

function friendly(): string {
  const en = document.documentElement.lang?.startsWith("en");
  if (navigator.onLine === false) return en ? "No internet connection. Check your network and try again." : "Sin conexión a internet. Revisa la red y vuelve a intentarlo.";
  return en ? "Could not reach the server. Check your connection and try again." : "No se ha podido conectar con el servidor. Comprueba la conexión y vuelve a intentarlo.";
}

export default function NetworkStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const original = window.fetch as Fetch;
    if (!original.__friendly) {
      const wrapped: Fetch = async (...args: Parameters<typeof fetch>) => {
        try {
          return await original(...args);
        } catch (err) {
          // Solo los fallos de red (no las cancelaciones ni los errores del servidor).
          if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) throw new TypeError(friendly());
          throw err;
        }
      };
      wrapped.__friendly = true;
      window.fetch = wrapped;
    }
    const sync = () => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-[999] flex justify-center px-3 pt-[max(8px,env(safe-area-inset-top))]">
      <span className="rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-semibold text-white shadow-lg">
        ⚠︎ Sin conexión a internet: los cambios no se guardarán hasta que vuelva
      </span>
    </div>
  );
}
