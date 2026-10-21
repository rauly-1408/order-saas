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

## 5. Caché de la carta

- La consulta de categorías, productos, opciones y menús (la más pesada de la tienda) se guarda **por restaurante durante 60 s** (`lib/menuCache.ts`, `unstable_cache` con etiqueta `menu:<tenantId>`).
- Se invalida al momento (`revalidateMenu`) cuando el panel cambia productos, categorías, menús o traducciones, y cuando el inventario marca algo como agotado. Como red de seguridad, caduca sola a los 60 s.
- Lo que depende de la hora (abierto/cerrado, huecos para programar) y las promociones no pasan por la caché.

## 6. Límite de peticiones por IP

- `lib/rateLimit.ts`. Con `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` (Upstash Redis, plan gratuito) el contador es compartido entre todas las funciones de Vercel; sin esas variables se cuenta en memoria por instancia (protege menos). Respuesta 429 con `Retry-After`.
- Límites: pedidos 12/min, cupones 20/min, tarjetas regalo 20/min, perks 30/min, direcciones 60/min, carta (API) 120/min, reseñas 5/min, **login 10 cada 15 min**.
- Alta de Upstash: upstash.com → Redis → base en `eu-central-1` → copiar REST URL y token → variables en Vercel → Redeploy.

## 7. Pruebas automáticas y CI

- `npm test` (Vitest): pruebas de la lógica pura en `src/app/lib/__tests__/`: precios de menús y opciones, promociones y tarjeta de sellos, propinas e IVA, costes y margen, segmentos de clientes, horarios y pedidos programados, dominios, lectura de albaranes y límite de peticiones. No tocan la base de datos.
- `npm run typecheck`: tipos de TypeScript.
- `.github/workflows/ci.yml`: en cada PR y en main se ejecutan lint, tipos y pruebas. Si algo falla, el PR lo marca en rojo antes de publicar.
- Para añadir una prueba: archivo `*.test.ts` junto a la lógica que prueba, con `describe`/`it` de Vitest.
- Dependencias: `@types/node` va en la versión 22 porque Vitest 5 la exige; con la 20, `npm install` fallaba en Vercel (ERESOLVE) y el despliegue del 21-10-2026 se quedó sin publicar.

## 8. Pendiente (antes de 50 restaurantes)

- Prueba de carga con k6: 50 restaurantes, 500 pedidos/hora.
- Tope mensual de gasto en IA por restaurante.
- Confirmación de pedido al cliente por email (hoy el checkout no pide email) o WhatsApp.
