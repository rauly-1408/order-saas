"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Pantalla de último recurso cuando falla el propio layout raíz. Avisa a Sentry
// y ofrece recargar. Textos en español, sin detalles técnicos para el cliente.
//
// Tras publicar una versión nueva, una pestaña abierta con la anterior pide
// trozos de código que ya no existen (ChunkLoadError). En ese caso se recarga
// sola una vez (como mucho cada 30 s, para no entrar en bucle) y carga la nueva.
const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i;
const RELOAD_KEY = "app:reloadedAfterDeploy";

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (STALE.test(`${error?.name ?? ""} ${error?.message ?? ""}`)) {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
          window.location.reload();
          return;
        }
      } catch {}
    }
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f4ec", color: "#14211c" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <p style={{ fontSize: 40, margin: 0 }}>😵</p>
            <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>Algo ha fallado</h1>
            <p style={{ color: "#5d6b64", margin: "0 0 20px" }}>Ya hemos recibido el aviso. Prueba a recargar; si sigue igual, vuelve en un minuto.</p>
            <button onClick={() => window.location.reload()} style={{ padding: "12px 22px", borderRadius: 999, border: 0, background: "#0d3328", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer" }}>
              Recargar
            </button>
            {error.digest && <p style={{ marginTop: 16, fontSize: 11, color: "#a1a1a6" }}>Ref. {error.digest}</p>}
          </div>
        </main>
      </body>
    </html>
  );
}
