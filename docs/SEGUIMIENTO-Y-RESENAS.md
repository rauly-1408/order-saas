# Seguimiento del pedido y reseñas

## Seguimiento en vivo (cliente)

La página de confirmación (`/pedir/[tenant]/confirmacion/[orderId]`) es ahora la **página de seguimiento**.

- Se actualiza sola cada 10 segundos hasta que el pedido se entrega o se cancela.
- Muestra una línea de pasos:
  - a domicilio: Recibido → En cocina → En camino → Entregado;
  - para recoger: Recibido → En cocina → Listo para recoger → Recogido.
- Muestra la **hora estimada** («Listo hacia las 21:35»). Se calcula al crear el pedido con los tiempos del local y el tiempo extra de ese momento (`Order.estimatedReadyAt`).
- **Avisarme**: el cliente da permiso de notificaciones y el navegador le avisa (y el móvil vibra) cuando el pedido entra en cocina, está listo, sale de reparto o se cancela.
  - Funciona mientras la página siga abierta, aunque sea en segundo plano.
  - Los avisos con el navegador cerrado necesitarán WhatsApp Business o notificaciones push.
- Solo se puede abrir el seguimiento desde la carta del propio restaurante. El id del pedido es largo e imposible de adivinar.

## Cancelar el pedido (cliente)

El cliente puede cancelar su pedido desde la página de seguimiento **mientras el restaurante no lo haya aceptado** (botón «Aceptar» del panel). Es la misma regla que Glovo, Just Eat o Uber Eats: hasta que alguien pulsa Aceptar, nadie ha gastado nada.

- Botón «Cancelar pedido» bajo la línea de pasos. Pide un motivo («Me he equivocado», «Dirección u hora incorrecta», «Ya no lo quiero») y confirma.
- **Pedido programado**: se puede cancelar hasta **una hora antes** de la hora elegida, aunque ya esté aceptado o en cocina.
- En cuanto el restaurante acepta, el botón desaparece y queda «¿Algún problema con tu pedido? Llama al restaurante», con el teléfono de Información del negocio.
- Solo puede cancelar quien hizo el pedido: hace falta la cookie de prueba de cliente que se deja al pedir (la misma de los sellos). Desde otro dispositivo, o con solo el enlace, no se puede. Tope de **2 cancelaciones por teléfono al día**; después, llamar.
- Al cancelar se deshace todo lo que el pedido había hecho: stock, cupón, tarjeta regalo, sellos, viaje del repartidor externo; si pagó online, **la devolución sale sola** por la pasarela; si estaba facturado (VeriFactu), sale la rectificativa.
- La página muestra «Has cancelado tu pedido» y, si pagó online, que el importe vuelve a su tarjeta en unos días.

**En el panel**: suena un aviso corto y grave (distinto al de pedido nuevo) y sale un aviso ámbar «Pedido #N cancelado por el cliente · motivo» en cualquier pantalla, para que cocina no lo prepare. El pedido pasa a «Últimas 24 h» con la etiqueta «Cancelado por el cliente · motivo». En **Informes**, la cifra «Cancelados» indica cuántos fueron del cliente.

Técnica: `lib/cancelOrder.ts` (`cancelOrder(orderId, by, reason)` y `customerCanCancel`) la usan el panel (`PATCH /api/orders/status`), el cliente (`POST /api/track/[orderId]/cancel`) y los pagos abandonados (`SYSTEM`). `Order.cancelledBy` (RESTAURANT / CUSTOMER / SYSTEM) y `Order.cancelReason`; migración `20261024090000_cancelar_cliente`. `GET /api/track/[orderId]` devuelve `canCancel` y `cancelledBy`.

## Reseñas

- Al entregar el pedido, la página pregunta «¿Qué tal tu pedido?»: de 1 a 5 estrellas y un comentario opcional. Hay una sola valoración por pedido.
- **Con 4 o 5 estrellas** se invita a dejar la reseña también en **Google**, con el enlace de Configuración → Marca → Presencia online → Reseñas de Google. Sin ese enlace no se muestra el botón.
- **Con 1 a 3 estrellas** se agradece y el comentario solo llega al restaurante.
- Panel → **Clientes → Reseñas**:
  - nota media, número de reseñas y % de pedidos entregados con reseña;
  - reparto de estrellas;
  - lista con cliente, número de pedido y fecha, con un filtro «Para mejorar (1-3★)».

## Técnica

- Migración `20261016230000_tracking_reviews`: columna `Order.estimatedReadyAt` y tabla `Review` (única por pedido).
- `src/app/lib/tracking.ts`: pasos, mensajes de aviso y validación de la reseña (lógica pura).
- `GET /api/track/[orderId]`: estado, canal, hora estimada, reseña y enlace de Google. Público y sin datos personales.
- `POST /api/track/[orderId]/review`: solo con el pedido entregado y una vez (409 si ya existe).
- `GET /api/admin/[tenant]/reviews`: para el panel, con el motor de retención.
