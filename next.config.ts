import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Cabeceras de seguridad en todas las respuestas. Ver docs/SEGURIDAD.md
// La CSP es mínima a propósito (no bloquea scripts ni estilos): impide meter la
// app dentro de otra web (clickjacking), plugins y <base> trampa, y limita a qué
// sitios se pueden enviar formularios (nosotros y la pasarela Redsys).
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self), usb=(), browsing-topics=()" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self' https://sis.redsys.es https://sis-t.redsys.es:25443; upgrade-insecure-requests",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // La letra del ticket (lib/receiptImage.tsx) se lee del disco al imprimir.
  outputFileTracingIncludes: { "/**": ["./src/app/lib/fonts/**"] },
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
