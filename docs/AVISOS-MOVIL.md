# Avisos en el móvil (Web Push)

Avisos que llegan al móvil aunque la app esté cerrada. Hecho el 2026-10-27 (rama `feat/terraza-push-vip`).

## Qué avisa
- **App del colaborador** («Mis ventas»): «¡Nueva venta! +2,45 € para ti · Este mes llevas 18,40 €» con cada pedido que trae su código. Si el pedido es online, el aviso llega cuando ya está pagado (va en `notifyNewOrder`, que solo corre con pedidos pagados o en tienda). Al tocarlo se abre su app.
- **Panel (dueño/encargado)**: «Queda poco: Cochinita · Quedan 45 kg (mínimo 50)» en el momento en que un ingrediente baja de su mínimo (lo detecta `applyStockDeltas` al mover el stock). Al tocarlo se abre Costes → Compras.

## Cómo se activa
- Colaborador: en su app, «Avisarme de cada venta».
- Dueño: en Costes → Inventario, tarjeta «Avisos en este móvil» → Activar (sale si hay algún mínimo puesto). Cada móvil u ordenador se activa por separado.
- **iPhone**: solo funciona con la app añadida a la pantalla de inicio (iOS 16.4 o posterior); si no, se explica cómo hacerlo. Android y ordenador: directo desde el navegador.

## Técnico
- `public/sw.js`: service worker solo para avisos (sin caché). El proxy no lo reescribe en dominios propios.
- Claves VAPID: se generan solas la primera vez y se guardan cifradas con `SESSION_SECRET` en `AppSecret` (no hay que configurar nada en Vercel). Si existen `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` en el entorno, se usan esas.
- Modelo `PushSubscription` (audiencia `PANEL` | `COLLABORATOR`, endpoint único). Los dispositivos que ya no existen (404/410) se borran solos al enviar.
- Rutas: `GET /api/push/key`, `POST|DELETE /api/admin/[tenant]/push` (dueño/encargado), `POST|DELETE /api/colaborador/[token]/push` (el enlace secreto es la llave).
- Código: `lib/push.ts` (servidor), `lib/pushClient.ts` (navegador), `(panel)/AvisosMovil.tsx`, `colaborador/[token]/ColaboradorLive.tsx`. Migración `20261027120000_avisos_movil`. Tests: `avisos-movil.test.ts`.
