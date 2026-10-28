# Caja (pedidos en mostrador y por teléfono)

Panel → **Caja**. La usan el gerente y el rol «Pedidos». Sirve para que el restaurante trabaje solo con nuestro panel aunque no tenga TPV: toma el pedido en el mostrador o por teléfono, lo cobra y lo manda a cocina al mismo tablero que los pedidos online.

## Qué hace el restaurante

- **Nota para cocina al elegir** un producto con opciones o un menú: atajos de un toque y texto libre, que salen en la comanda (igual que en Mesas).
Tres pantallas en el ticket, como en un TPV (Square, Shopify POS):

1. **Pedido.** Pensada para cobrar con prisa: la carta es una **botonera de texto** (nombre y precio grandes, sin foto) con un **color por categoría**, siempre el mismo, para encontrar las cosas sin leer; caben 12 o más productos por pantalla en el móvil. Colores elegidos por el restaurante, por el nombre de la categoría: veganos verde, carne granate, del mar celeste, burger rojo, menús morado, complementos amarillo, bebidas gris y postres rosa (las categorías que no encajan toman uno libre: naranja, turquesa, añil, lima). Arriba, fijos, el buscador, el estado de la caja, «Hoy» y las categorías (cada una con su punto de color; en el móvil, en una fila que se desliza). **Se ve una categoría a la vez**, como en un TPV: todos sus productos en pantalla sin desplazarse. Al entrar se abre **«Más vendidos»**: los 12 productos con más unidades de los últimos 30 días (`GET /api/admin/[tenant]/caja/top`, sin importes); se carga al entrar y no cambia durante el turno, para que los botones no se muevan bajo los dedos. **Mantener pulsado** un producto enseña su foto y sus ingredientes, con «Añadir» (para quien aún no se sabe la carta); en el ordenador, además, la descripción sale al pasar el ratón. Los productos con opciones o los menús abren la misma hoja que en la tienda; los simples entran al primer toque y el azulejo muestra cuántos van. Arriba del ticket se elige **Para llevar / Comer aquí / A domicilio** (con dirección) y **¿Cómo llega?: En el mostrador / Por teléfono**. Con el ticket vacío se ve «Pedido vacío · Toca un producto de la carta para añadirlo aquí» y el botón dice «Añade productos para cobrar». Cliente, cupón y nota para cocina van plegados en «＋ Cliente, cupón o nota». Con teléfono, el pedido suma sellos y entra en Clientes como un pedido online; sin teléfono queda como «Mostrador».
2. **Cobro.** «Cobrar X €» lleva a la pantalla de cobro: total en grande, forma de pago (**efectivo**, **datáfono**, **Bizum** o **pagar al recoger**) y, en efectivo, importes rápidos (justo y los billetes que lo cubren) más un teclado numérico; el cambio o lo que falta se ve al momento. Sin dirección en un pedido a domicilio no deja confirmar.
3. **Hecho.** Número de pedido y, en efectivo, el **cambio a devolver** en grande. «Nuevo pedido» vuelve a empezar. El pedido aparece en Pedidos → Nuevos con la etiqueta «Mostrador» o «Teléfono» y cómo se ha pagado.

**Cada línea se edita** (lo recuerda una línea bajo el pedido). Tocando el nombre de una línea se despliega: **nota para cocina** («sin cebolla»), **descuento** (−10 %, −50 %, invitación o un importe a mano) y «Quitar línea». La nota sale en la tarjeta de Pedidos y en el email de pedido nuevo; el descuento se resta en la línea y queda guardado en ella (`OrderLine.note`, `OrderLine.discountCents`). Solo la Caja puede aplicar descuentos: la tienda pública los ignora.

**Panel de estado.** Arriba a la derecha, «Caja», «En espera» y «Hoy» van juntos en un panel con apartados (etiqueta pequeña y dato), con esquinas rectas y bordes, para que no se confundan con las categorías, que son píldoras. En el móvil el panel ocupa su propia fila encima del buscador.

**Pedidos en espera.** «Aparcar» guarda el pedido en curso (líneas, tipo, cliente, nota, cupón) y deja el ticket limpio. Con el ticket vacío, los aparcados salen **en el propio ticket**, cada uno con dos botones: **«Cobrar X €»** (lo abre directamente en la pantalla de cobro) y «Añadir más» (vuelve al ticket para seguir pidiendo). En el móvil, la barra de abajo muestra «En espera (n) · Cobrar o seguir». El botón «En espera · n» de arriba abre la misma lista con los mismos botones y la papelera para descartar (pide confirmación). Si al recuperar uno hay otro a medias, ese se aparca solo. Se guardan en el dispositivo (localStorage), no en el servidor: un pedido aparcado en la tablet no se ve en el móvil.

**Cobro al entregar o al recoger.** Un pedido pendiente de cobro (online «al recoger / al entregar», o de Caja con «pagar al recoger») no se da por entregado sin apuntar el cobro: el botón pasa a «Entregado y cobrar» y pregunta **¿Cómo ha pagado? Efectivo / Datáfono / Bizum**. Si alguno se entregó sin apuntarlo, en Pedidos → Últimas 24 h aparece «Sin cobrar · apuntar» para registrarlo después. Así el resumen de caja y los informes cuadran con el dinero real.

**Quién ve lo recaudado.** Solo los usuarios con la casilla **«Ve lo recaudado»** (Configuración → Usuarios y permisos): al crear el restaurante la tiene el administrador principal y nadie más. Sin ella, la Caja no muestra ni el botón «Hoy», ni la tarjeta «Recaudado hoy», ni la barra del móvil; Inicio enseña «Pedidos de hoy» en lugar de los ingresos y oculta el ticket medio; Informes no sale en el menú y su página explica cómo pedir el permiso; y las APIs de resumen, informes y exportación responden 403. Quien la tiene dispone además de un **ojo**, junto al botón «Hoy», para tapar los importes (••••) cuando haya alguien mirando; se recuerda en el dispositivo.

**Abrir y cerrar caja (arqueo).** El botón «Abrir caja / Caja abierta» de arriba abre la hoja **Caja**. Si está cerrada, un aviso lo recuerda al entrar.
1. **Abrir**: «¿Con cuánto efectivo empiezas?» (el fondo; atajos 0, 50, 100, 150, 200 €).
2. **Durante el día**: «− Sale dinero» y «+ Entra dinero», con motivo (pago a proveedor, retirada al banco, cambio para el cajón, propinas, otro).
3. **Cerrar**: se cuenta el cajón y se escribe el total (más una nota si hace falta). Se cuenta **a ciegas**: lo que debería haber se ve después, nunca antes.
4. **Resultado**: «Cuadra», «Sobran X €» o «Faltan X €» (verde si cuadra, ámbar hasta 1 €, rojo si es más), con lo esperado, lo contado y lo cobrado en total. Si hay impresora de tickets, sale el **informe de cierre** (ventas por forma de pago y efectivo del cajón).

Lo que debería haber = fondo + cobrado en efectivo desde la apertura + entradas − salidas. Cuenta el momento del cobro: un pedido «al recoger» cobrado en efectivo al entregarlo entra en la caja que esté abierta en ese momento. Quien no tiene «Ve lo recaudado» abre, apunta y cierra igual, pero no ve lo esperado, la diferencia ni los cierres anteriores; el administrador sí (lista de los últimos 14 cierres con quién y cuánto). Una caja por local.

**Hoy en caja.** Con el ticket vacío, la tarjeta grande **«Recaudado hoy»** (lo cobrado, cuántas ventas, lo pendiente y el desglose por forma de pago) está a la vista entre pedido y pedido; ella y el botón «Hoy · n ventas · total» junto al buscador abren el resumen del día en la hora del restaurante: ventas y pedidos, desglose por forma de pago (efectivo, datáfono, Bizum, tarjeta online), lo pendiente de cobrar (pedidos activos «al recoger» o «al entregar»), lo devuelto por cancelaciones y la lista de pedidos con hora, origen, forma de pago y estado. Cuenta todo lo que llegó a cocina (online y Caja); un usuario con local asignado solo ve su local. El efectivo que debe haber en el cajón es la venta en efectivo más el fondo de apertura; el arqueo con fondo y recuento es la entrega 3.

En el móvil, con productos en el pedido, abajo hay dos botones: **«Ver (n)»** abre el pedido para corregir algo y **«Cobrar X €»** va directo a la pantalla de cobro (un toque menos). Sin pedido no hay barra. El cobro y la confirmación van en la misma hoja.

Las promociones automáticas y los cupones se aplican igual que en la tienda. No hay propina ni tarjeta regalo en la Caja (de momento).

## Pantallas táctiles

El software se recomienda con pantalla táctil (tablet de 10–13″ en horizontal o TPV táctil de 15,6″). Por eso:
- Todo lo que se toca en la Caja mide **44 px o más**: categorías, botones de arriba, tipo de pedido, cantidades, importes rápidos y teclado (48 px).
- El menú lateral es **el mismo en todas las pantallas** (también en Caja y Mesas): cambiarlo según la página despista. Va por apartados: Inicio · **Día a día** (Caja, Pedidos, Mesas, Facturas) · **Tu carta** (Carta, Archivos) · **Clientes** (Clientes, Colaboradores) · **Números** (Informes, Costes), y cabe entero en 768 px de alto. En Pedidos, las cuatro columnas salen desde 1280 px; entre 640 y 1279, de dos en dos. Los botones de cada pedido van en cuadrícula de dos para no salirse de la tarjeta. El ticket mide 340 px (380 px desde 1280). La cabecera (buscador, panel de estado y categorías) y los productos se adaptan al **hueco de la carta**, no a la pantalla (consultas de contenedor): si el hueco es estrecho (móvil, tablet horizontal con el ticket al lado), estado arriba, buscador debajo y categorías en una fila que se desliza; si es ancho, todo en una fila con el buscador de un ancho cómodo (máx. 320-384 px) y las categorías en varias filas. Productos: tantas columnas como quepan (mínimo 104 px; 128 px en escritorio estrecho; 140 px con hueco ancho), con 8-12 px de separación y tarjetas de 92 px de alto.
- La botonera muestra 4 columnas a 1024 px y 5 desde 1280 px: en un TPV de 1366×768 las 24 bebidas caben sin desplazarse.
- Los botones tienen `touch-action: manipulation`: dos toques rápidos suman dos y no hacen zoom.

## Entregas

| Entrega | Estado |
|---|---|
| 1. Tomar pedidos y cobrar | ✅ 2026-10-23 (pantallas de pedido → cobro → hecho; líneas con nota y descuento; pedidos en espera) |
| 2. Impresión de ticket y comanda (80 mm) | ✅ 2026-10-23 (ver `docs/IMPRESION.md`); pendiente la prueba con la impresora real |
| 3. Apertura y cierre de caja (arqueo) | ✅ 2026-10-23 |
| 4. VeriFactu (facturas simplificadas, huella encadenada, QR, envío a Hacienda). Obligatorio desde 2027 | ✅ 2026-10-23 emisión, cadena, QR y registro (ver `docs/VERIFACTU.md`); falta el envío a la AEAT, que necesita el certificado del restaurante |

Mesas y sala: ver `docs/MESAS.md`. Sin internet la Caja sigue vendiendo: la venta se guarda en el aparato y se envía sola al volver (ver `docs/SIN-CONEXION.md`).

## Técnica

- Migración `20261023090000_caja`: enum `OrderSource` (ONLINE, COUNTER, PHONE), `PaymentMethod` suma `CASH` y `CARD_TERMINAL`; `Order.source`, `dineIn`, `createdByUserId`, `cashTenderedCents`.
- `lib/orderPricing.ts` (`priceOrderItems`): precio de las líneas desde la base de datos; lo comparten la tienda y la Caja. Acepta `note` por línea (cualquier canal) y `discountCents` solo con `{ allowDiscount: true }` (la Caja). Migración `20261023150000_caja_lineas`.
- `lib/createOrder.ts` (`createOrderWithNumber`): crea el pedido con número correlativo, CRM (solo si hay teléfono), cupón, tarjeta regalo, atribución y stock. Antes vivía dentro de la ruta de pedidos.
- `POST /api/admin/[tenant]/caja`: sesión del restaurante (cualquier rol), local de la sesión o el primero activo. No comprueba el horario (el mostrador siempre puede) ni exige teléfono. Pagos `CASH`/`CARD_TERMINAL`/`BIZUM` quedan `PAID` al crearse; `IN_STORE` queda sin cobrar.
- `PATCH /api/orders/status/[orderId]` acepta `paidWith` (`CASH` | `CARD_TERMINAL` | `BIZUM`): con `status: "DELIVERED"` apunta el cobro al entregar; solo, registra el cobro de un pedido ya entregado (rechaza cancelados y ya cobrados).
- `User.seesTakings` (migración `20261023160000_sees_takings`: la pone a true al gerente más antiguo de cada restaurante y al SUPERADMIN). Va en la sesión (`seesTakings`, releída de la base de datos en cada petición) y se edita con `PATCH /api/admin/[tenant]/users { id, seesTakings }`.
- Modelos `CashSession` (fondo, apertura y cierre con quién, contado, esperado, diferencia, resumen y nota) y `CashMovement` (entradas y salidas), migración `20261023180000_cierre_caja` (también añade `CLOSING` a `PrintKind`). `lib/cashSession.ts` (`sessionFigures`: cobros del local por `paidAt` en la ventana de la sesión). `Order.paidAt` se rellena al cobrar en la Caja y al apuntar el cobro al entregar.
- `GET/POST /api/admin/[tenant]/caja/sesion` (`open`, `move`, `close`): cualquier usuario del restaurante; cifras, diferencia e histórico solo con `seesTakings`. Abrir va con bloqueo por local y cerrar solo actúa si la caja sigue abierta, así dos toques a la vez no duplican nada. Al cerrar encola el informe de cierre (`enqueueClosing`) en las impresoras de tickets del local, solo si quien cierra tiene `seesTakings`. Los descuentos de línea solo los aplica el gerente. Ver `docs/SEGURIDAD.md`.
- `GET /api/admin/[tenant]/caja/hoy`: resumen del día (403 sin `seesTakings`) (desde `startOfTodayIn` en la zona horaria del restaurante), sin `AWAITING_PAYMENT`; filtra por `storeId` de la sesión si lo hay.
- Pantalla `caja/CajaClient.tsx`: lee la carta de `/api/menu/[tenant]` y reutiliza `ProductOptionsSheet` y `ComboSheet` de la tienda (las variables de color de la tienda se mapean a las del panel). La Caja ocupa la pantalla y se desplaza por dentro (en el móvil, entera; en el ordenador, solo la carta), para que la barra de categorías `sticky` funcione: el `<main>` del panel no es quien se desplaza en el móvil.
- El tablero de Pedidos muestra `source`, `dineIn` y la forma de pago.
- Cancelar un pedido cobrado en caja (sin pasarela) lo marca como devuelto y avisa «Devuelve el efectivo al cliente en caja» (o por datáfono/Bizum); no se llama a ninguna pasarela.
