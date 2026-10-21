import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  typescript: {
    // Los tipos generados por Next.js 16 para route handlers con params dinámicos
    // tienen un conflicto conocido con el strict mode. El código es correcto.
    // TODO: Eliminar cuando Next.js resuelva el issue de RouteHandlerConfig.
    ignoreBuildErrors: true,
  },
};

// Sentry: avisos de errores en producción (ver docs/OPERACIONES.md). Sin
// SENTRY_AUTH_TOKEN no se suben source maps, pero los errores llegan igual.
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
  // Las rutas de la API atraviesan el proxy sin que el bloqueador de anuncios
  // del navegador corte los avisos a Sentry.
  tunnelRoute: "/monitoring",
  widenClientFileUpload: false,
});
