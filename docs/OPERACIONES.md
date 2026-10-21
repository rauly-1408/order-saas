# Operaciones: capacidad, avisos y copias

Qué hace falta para que la plataforma aguante más restaurantes sin sorpresas, y cómo nos enteramos cuando algo falla. Estado a 2026-10-21.

## Capacidad (estimación con el código actual)

| Restaurantes | ¿Aguanta? | Qué hace falta |
|---|---|---|
| 1–10 | Sí | Nada. |
| 10–100 | Sí | URL «pooled» de Neon y avisos de errores (esta página). |
| 100–1.000 | Con cambios | Caché de la tienda por restaurante, avisos al panel en tiempo real (hoy pregunta cada 8–10 s), imágenes en Blob + CDN, límite de peticiones en rutas públicas, prueba de carga. |
| Más de 1.000 | Es otro proyecto | Planes de pago de Vercel y Neon, colas para IA y WhatsApp, equipo de guardia. |

Lo que ya está bien: pagos idempotentes con firma verificada, aislamiento entre restaurantes (auditado el 21-10-2026), secretos cifrados, migraciones con historial, una sola región (Fráncfort).

## 1. Base de datos: conexión «pooled» de Neon

Cada función de Vercel abre su propia conexión. Con la URL directa, en un pico (hora de cenar, varios restaurantes) se alcanza el tope de conexiones de Neon y salen errores 500 al azar. Con la URL **pooled** (PgBouncer) caben miles.

- `DATABASE_URL` (Vercel): la URL **pooled** de Neon. Es la que trae `-pooler` en el host, por ejemplo `postgresql://usuario:clave@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`. Añadir al final `&pgbouncer=true&connect_timeout=15` (Prisma lo recomienda con PgBouncer).
- `DIRECT_URL` (Vercel y `.env` local): la URL **directa** (sin `-pooler`). Solo la usan las migraciones (`prisma migrate`), que necesitan una conexión normal. En local puede ser la misma que `DATABASE_URL`.
- `prisma/schema.prisma` declara `directUrl = env("DIRECT_URL")`.
- Tras cambiar las variables en Vercel: **Redeploy**.

## 2. Avisos de errores: Sentry

- Paquete `@sentry/nextjs`. Configuración en `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation.ts`, `src/instrumentation-client.ts` y `src/app/global-error.tsx`. `next.config.ts` va envuelto con `withSentryConfig` (ruta túnel `/monitoring` para que los bloqueadores no corten los avisos).
- **Solo se activa con `NEXT_PUBLIC_SENTRY_DSN`** en Vercel. Sin esa variable no envía nada (en local no hace falta).
- No se envían datos personales (el SDK no incluye IP ni usuario por defecto). Trazas de rendimiento: 10 % en servidor, 5 % en navegador.
- Opcional: `SENTRY_ORG`, `SENTRY_PROJECT` y `SENTRY_AUTH_TOKEN` para subir source maps (los errores se leen con nombres de archivo reales). Sin token, los errores llegan igual.
- Alta: cuenta gratuita en sentry.io (5.000 errores al mes) → proyecto Next.js → copiar el DSN → variable en Vercel → Redeploy. Activar alertas por email o Slack en Sentry → Alerts.

## 3. ¿Está caída la tienda?: vigilante de disponibilidad

- `GET /api/health` responde `{ ok: true, db: "ok", ms }` si la app y la base de datos contestan, y `503 { ok: false }` si la base tarda más de 5 s. No expone nada del negocio.
- Alta gratuita en UptimeRobot (o Better Stack): monitor HTTP cada 5 min a `https://order-saas-delta.vercel.app/api/health`, aviso por email y, en el plan gratuito, por app móvil. Añadir un segundo monitor a `https://order-saas-delta.vercel.app/pedir/estafeten`.

## 4. Copias de seguridad

- Neon guarda el historial para volver a cualquier instante (PITR). En el plan gratuito son pocas horas; en el plan Launch, 7 días. Antes del primer restaurante de pago conviene pasar a Launch.
- Nunca `prisma db push` contra Neon: solo migraciones (ver ROADMAP).

## 5. Pendiente (antes de 50 restaurantes)

- Límite de peticiones por IP en rutas públicas (pedidos, cupones, direcciones, perks).
- Caché de la página de la tienda con renovación al editar la carta.
- Prueba de carga con k6: 50 restaurantes, 500 pedidos/hora.
- Tope mensual de gasto en IA por restaurante.
