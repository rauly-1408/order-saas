// Sentry en el servidor (funciones de Vercel). Solo se activa si hay DSN:
// sin NEXT_PUBLIC_SENTRY_DSN no envía nada. Ver docs/OPERACIONES.md
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  // Errores siempre; trazas de rendimiento solo una muestra (coste y cuota).
  tracesSampleRate: 0.1,
});
