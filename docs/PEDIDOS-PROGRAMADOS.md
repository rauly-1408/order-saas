# Pedidos programados y dirección con sugerencias

## Programar el pedido

- En el checkout, «¿Cuándo lo quieres?»: **⚡ Lo antes posible** (unos X min) o **🕐 Programar** (día y hora).
- Con la tienda **cerrada**, solo se puede programar. La carta lo avisa: «Puedes hacer tu pedido ya y programarlo para cuando abramos».
- El **día** se elige con tres botones (Hoy · Mañana · siguiente) y la **hora** con una **rueda a la vista como la de la alarma del iPhone**: dos columnas (hora · minutos), 7 filas visibles, la del centro es la elegida; se desliza con el dedo, con la rueda del ratón o con las flechas del teclado. Solo tiene las horas válidas (24 h, cada 5 min); al cambiar la hora, los minutos son los que valen para esa hora. Al cambiar el día se intenta mantener la misma hora. Componente `checkout/TimePicker.tsx`.
  - No se usan `<input type="time">` ni `<select>`: el primero sale en a.m./p.m. en Chrome de escritorio y el segundo abre un desplegable, no la rueda a la vista que quiere el dueño.
  - Debajo se indica el tramo disponible («Puedes elegir entre las 20:20 y las 23:55»).
  - Qué horas hay depende de **Configuración → Horario y zonas** y del tiempo de preparación o entrega: la tienda solo ofrece horas en las que está abierta y la cocina puede empezar a tiempo.
- Horas cada **5 min** (`SLOT_STEP_MIN` en `schedule.ts`), para **hoy y los dos días siguientes**. Una hora vale si el local está abierto **a esa hora y cuando la cocina tiene que empezar** (hora − tiempo de preparación o entrega).
  - Ejemplo con apertura a las 20:00: recoger desde las 20:30 (20 min) y a domicilio desde las 20:45 (35 min).
  - Se tienen en cuenta los cierres programados y la pausa.
- El servidor vuelve a comprobar la hora (`scheduleProblem`): ni pasada, ni desalineada, ni fuera de horario.
- El pedido guarda `scheduledFor` y la hora estimada pasa a ser la programada. El seguimiento muestra «Listo hacia las 21:30» y, si es otro día, «· mañana» o el día («· sábado 18»).
- Panel → Pedidos: la tarjeta muestra **⏰ Programado: hoy a las 21:30**. Entra como pedido nuevo: hay que aceptarlo, y el aviso sonoro suena hasta que se acepta.

## Dirección con sugerencias

- Al escribir la dirección de entrega aparecen direcciones reales (a partir de 4 letras). Con un portal concreto se rellenan la dirección y el **código postal**, que decide la zona y el envío. Si solo se elige la calle, pide el número.
- Proveedor: **CartoCiudad** (Instituto Geográfico Nacional): gratis, sin clave y con los portales de España. Solo se muestran direcciones de la provincia de las zonas de reparto. Si la dirección está fuera de zona, el checkout lo dice.
- **Google Maps**: se puede añadir cuando el restaurante tenga su clave de Google (Places API) configurada en Vercel; el proveedor está aislado en `src/app/lib/address.ts`.
- Si el servicio no responde, el cliente escribe la dirección a mano, como antes.

## Tarjeta de sellos

En la carta y el checkout se ve con la paleta de la marca: fondo del color principal, título en la fuente de rótulo, sellos en el color secundario y el regalo al final. Con premio disponible, la tarjeta pasa al color secundario.

## Técnica

- `src/app/lib/schedule.ts`: `availableSlots`, `scheduleProblem` y `scheduledLabel` (lógica pura).
- `publicStoreInfo` incluye `slots.DELIVERY` y `slots.TAKEAWAY`.
- Migración `20261017090000_scheduled_orders`: columna `Order.scheduledFor`.
- `GET /api/address/[tenant]?q=` llama a CartoCiudad (público, no guarda nada). Componentes `checkout/AddressInput.tsx` y `StampCard.tsx`.
