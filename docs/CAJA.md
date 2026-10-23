# Caja (pedidos en mostrador y por teléfono)

Panel → **Caja**. La usan el gerente y el rol «Pedidos». Sirve para que el restaurante trabaje solo con nuestro panel aunque no tenga TPV: toma el pedido en el mostrador o por teléfono, lo cobra y lo manda a cocina al mismo tablero que los pedidos online.

## Qué hace el restaurante

1. Toca categorías y productos (la misma carta que ve el cliente, con sus opciones y menús). Los productos con opciones o los menús abren la misma hoja que en la tienda.
2. A la derecha (o abajo, en el móvil) va el ticket: cantidades, quitar, total.
3. Elige: **Mostrador** o **Teléfono**; **para llevar**, **para comer aquí** o **a domicilio** (con dirección).
4. Cliente opcional: nombre y teléfono. Con teléfono, el pedido suma sellos en la tarjeta de fidelidad y entra en Clientes como cualquier pedido online; sin teléfono queda como «Mostrador».
5. Cobro: **efectivo** (escribe lo que entrega el cliente y calcula el cambio), **datáfono**, **Bizum** o **pagar al recoger** (pedidos por teléfono).
6. «Cobrar y enviar a cocina»: crea el pedido y aparece en Pedidos → Nuevos con la etiqueta «Mostrador» o «Teléfono» y cómo se ha pagado.

Las promociones automáticas y los cupones se aplican igual que en la tienda. No hay propina ni tarjeta regalo en la Caja (de momento).

## Entregas

| Entrega | Estado |
|---|---|
| 1. Tomar pedidos y cobrar | ✅ 2026-10-23 |
| 2. Impresión de ticket y comanda (80 mm) | pendiente |
| 3. Apertura y cierre de caja (arqueo) | pendiente |
| 4. VeriFactu (facturas simplificadas, huella encadenada, QR, envío a Hacienda). Obligatorio desde 2027 | pendiente, antes de 2027 |

Fuera de alcance (sería un TPV completo): mesas y sala, varios terminales, modo sin internet.

## Técnica

- Migración `20261023090000_caja`: enum `OrderSource` (ONLINE, COUNTER, PHONE), `PaymentMethod` suma `CASH` y `CARD_TERMINAL`; `Order.source`, `dineIn`, `createdByUserId`, `cashTenderedCents`.
- `lib/orderPricing.ts` (`priceOrderItems`): precio de las líneas desde la base de datos; lo comparten la tienda y la Caja.
- `lib/createOrder.ts` (`createOrderWithNumber`): crea el pedido con número correlativo, CRM (solo si hay teléfono), cupón, tarjeta regalo, atribución y stock. Antes vivía dentro de la ruta de pedidos.
- `POST /api/admin/[tenant]/caja`: sesión del restaurante (cualquier rol), local de la sesión o el primero activo. No comprueba el horario (el mostrador siempre puede) ni exige teléfono. Pagos `CASH`/`CARD_TERMINAL`/`BIZUM` quedan `PAID` al crearse; `IN_STORE` queda sin cobrar.
- Pantalla `caja/CajaClient.tsx`: lee la carta de `/api/menu/[tenant]` y reutiliza `ProductOptionsSheet` y `ComboSheet` de la tienda (las variables de color de la tienda se mapean a las del panel).
- El tablero de Pedidos muestra `source`, `dineIn` y la forma de pago.
- Cancelar un pedido cobrado en caja (sin pasarela) lo marca como devuelto y avisa «Devuelve el efectivo al cliente en caja» (o por datáfono/Bizum); no se llama a ninguna pasarela.
