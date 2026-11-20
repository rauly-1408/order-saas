# Seguridad

## Lo que ya hay

- HTTPS siempre (Vercel) y HSTS de 2 años.
- Contraseñas con scrypt; claves de terceros cifradas (AES-256-GCM, `secretBox`).
- Base de datos de Neon cifrada en reposo.
- Límite de peticiones por IP en login, pedidos, tarjetas regalo, agente de impresión… (`lib/rateLimit.ts`). Sin Upstash es por servidor; con Upstash, común a todos.
- Cortafuegos de Vercel contra ataques de denegación de servicio (siempre activo).

## Cabeceras de seguridad (`next.config.ts`)

| Cabecera | Para qué |
|---|---|
| `Strict-Transport-Security` | El navegador solo entra por HTTPS (2 años). |
| `X-Content-Type-Options: nosniff` | No interpreta un archivo como lo que no es (p. ej. una imagen como script). |
| `Referrer-Policy: strict-origin-when-cross-origin` | Al salir a otra web solo se envía el dominio, no la dirección completa (que puede llevar códigos). |
| `X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'` | Nadie puede meter el panel o la tienda dentro de su web para engañar a un clic (clickjacking). |
| `Permissions-Policy` | Cámara, micrófono, ubicación y pago solo para nuestra web; nada de USB ni seguimiento publicitario. |
| `Content-Security-Policy` (mínima) | Sin plugins, sin `<base>` trampa y formularios solo hacia nosotros y Redsys (`form-action`). |

La CSP no limita scripts ni estilos a propósito: la tienda usa estilos en línea y servicios como Stripe; endurecerla exige probar cada pasarela. Si se añade otra pasarela que envíe un formulario a su web, hay que añadir su dominio a `form-action`.

## Cortafuegos de Vercel (lo configura el dueño)

Vercel → proyecto `order-saas` → **Firewall**. Reglas recomendadas: ver la guía del PR que lo añadió.

## Upstash (límite de peticiones común)

Con varias instancias de Vercel a la vez, el límite por IP en memoria se reparte. Con Upstash Redis (gratis hasta 500.000 peticiones al mes) el límite es el mismo para todas. Variables en Vercel: `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.
