# Sin conexión (plan B si se cae la wifi)

Un sábado lleno con la wifi caída no puede parar la sala. Hay dos capas:

## 1. La app aguanta sola (Mesas y Caja)

Si se va internet con el panel abierto:

- Arriba sale **«Sin conexión · rondas y ventas se guardan»**.
- **Mesas**: se puede abrir una mesa nueva y tomar nota, y mandar rondas a las mesas ya abiertas (aunque no se pueda ver su cuenta). Al pulsar «Enviar a cocina» la ronda se guarda en el aparato.
- **Caja**: se puede vender. La pantalla final dice **«Pedido guardado»** y enseña el cambio que hay que devolver; el número de pedido llega al enviarse.
- Abajo (en el móvil, bajo la barra de arriba) un aviso cuenta lo que espera: **«2 envíos guardados sin conexión»**. Tocándolo se ve la lista.
- En cuanto vuelve internet todo se envía **solo y en orden**, sale en cocina por sus impresoras y aparece «✓ Enviado lo que estaba guardado». El plano de mesas y «Hoy en caja» se ponen al día.
- **Nunca se duplica**: cada envío lleva un código único; si llega dos veces (la conexión se cortó justo al enviar), el servidor devuelve la primera respuesta sin crear nada nuevo.
- Si el servidor rechaza algo al enviarlo (por ejemplo, la mesa ya se cobró desde otro aparato), queda en rojo en la lista con el motivo y un botón **Quitar**; no frena a lo demás.

**Lo que no se puede sin internet**: cobrar una mesa, ver la cuenta, anular, cambiar de mesa, recargar la página o cambiar de pestaña del panel. **No recargues ni cierres la página** mientras no haya conexión: lo guardado vive en ese navegador. Si se recarga sin internet, el navegador enseña su página de error y no se puede tomar nota hasta que vuelva (lo guardado no se pierde: se envía al volver a abrir el panel).

La carta se guarda en el aparato al entrar en Mesas o en Caja; si se cae internet después, se sigue pudiendo tomar nota. El total de una venta guardada es sin cupones (el cupón se aplica al enviarse).

**Comandas**: salen al volver internet, porque el agente de impresión recibe los trabajos desde la app. Mientras tanto, el camarero canta la comanda o la apunta en papel.

## 2. Que no se caiga internet: router 4G de respaldo (recomendado)

La forma de que el sábado ni se note: un **router 4G/5G con una SIM de datos** conectado como respaldo de la fibra (conmutación automática, «failover»). Cuesta unos 60-150 € más una tarifa de datos de 10-15 €/mes. Si la fibra cae, el router pasa a 4G en segundos y todo sigue igual, también la impresión. Con el modo sin conexión de arriba, los segundos del cambio tampoco se notan.

Alternativa de emergencia: compartir datos desde un móvil y conectar a esa red el ordenador de la sala **y** el ordenador del agente de impresión (la impresora sigue en la wifi del local; el agente necesita las dos cosas: internet y ver la impresora, así que con un móvil solo vale si el PC del agente tiene cable a la red del local).

## Técnica

- `src/app/admin/[tenant]/(panel)/outbox.ts`: cola en `localStorage` (`panel-outbox-v1`). `sendOrQueue(url, body, label)` añade `requestId` (uuid) y envía; sin red, con 502/503/504 o si ya hay algo en cola, lo guarda. `flush()` reenvía en orden (para en el primer fallo de red o en un 401; un rechazo queda marcado con su error). `saveLocal`/`loadLocal` guardan la carta. Evento `panel-outbox-sent` al enviar algo.
- `OutboxBar.tsx` (en el diseño del panel): reintenta cada 10 s y al volver la conexión; muestra lo pendiente y lo rechazado.
- `lib/idempotency.ts` → `once(tenantId, requestId, fn)`: guarda el envío en `ClientRequest` (migración `20261025120000_client_requests`) antes de atenderlo; si ya existe, devuelve la respuesta guardada (o 409 «se está procesando»). Las respuestas con error no se guardan, para poder reintentar. Se borra lo de más de 7 días.
- Usan `requestId`: `POST /api/admin/[tenant]/caja`, `POST /api/admin/[tenant]/mesas/[orderId] { action: "round" }` y `POST /api/admin/[tenant]/mesas { action: "open", round }` (abrir y primera ronda a la vez; si la mesa ya la abrió otro, la ronda se suma a esa cuenta). `lib/tableRound.ts` → `prepareRound` es común a ambas.
- Pruebas: `src/app/lib/__tests__/sin-conexion.test.ts`.
