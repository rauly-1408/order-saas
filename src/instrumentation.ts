// Arranque de Sentry en el servidor y captura de errores de peticiones
// (páginas y rutas de la API). Ver docs/OPERACIONES.md
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
