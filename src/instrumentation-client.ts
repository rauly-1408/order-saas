// Sentry en el navegador (tienda y panel). Solo con NEXT_PUBLIC_SENTRY_DSN.
// No se envían datos personales: ni teléfonos ni nombres. Ver docs/OPERACIONES.md
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.05,
  // Ruido habitual de navegadores y extensiones que no es un fallo nuestro.
  ignoreErrors: ["ResizeObserver loop", "Load failed", "NetworkError", "AbortError"],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
