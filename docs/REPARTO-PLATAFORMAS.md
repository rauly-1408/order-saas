# Reparto con plataformas (Glovo, Uber Eats, Just Eat)

Para restaurantes **sin repartidores propios**, como Estafetén. Es el mismo modelo que McDonald's (McDelivery) o Burger King: el reparto lo hace una plataforma.

## Fase 1 — «Escoge quién te lo lleva» (hecha)

- Panel → **Configuración → Envío y entrega → Reparto con plataformas**: el enlace de la tienda del restaurante en Glovo, Uber Eats y Just Eat. Solo se aceptan enlaces de la web de cada plataforma.
- Si además se desactiva **Delivery** (reparto propio):
  - la cabecera de la carta dice «Recogida · a domicilio con plataformas»;
  - la carta muestra «¿Lo quieres en casa? Escoge quién te lo lleva» con un botón por plataforma;
  - en el checkout, «A domicilio» abre el mismo selector. «Recoger» sigue pidiendo en nuestra tienda;
  - se ocultan las promociones que solo valen para domicilio (envío gratis, etc.).
- Si el restaurante sí reparte, los botones salen como «También a domicilio con…».
- **«¿Con quién quieres tu pedido?»** (como en la app de Burger King): al pulsar «🛵 A domicilio» en la carta o en el pago se abre una ventana con Glovo, Uber Eats y Just Eat (las que tengan enlace). Si el restaurante reparte, su opción va primero: «Con Estafetén · Pides y pagas aquí». Elegirla en la carta deja el pago ya en «A domicilio»; las plataformas abren su app en otra pestaña. Código: `src/app/pedir/[tenant]/DeliveryChooser.tsx`.
- Limitación: el pedido y el pago se hacen en la app de la plataforma. El carrito no se pasa, y ese cliente y la comisión (25-35 %) se quedan allí.

## Fase 2 — Pedido propio + repartidor externo (hecha: ver REPARTO-EXTERNO.md)

El cliente pide y paga en nuestra tienda (nos quedamos el cliente, sin comisión sobre el pedido) y solo se contrata el **repartidor** por viaje: Uber Direct, Glovo On-Demand o Stuart. Al aceptar el pedido se pide el repartidor, y el seguimiento muestra la llegada. Necesita una cuenta de empresa del restaurante con uno de esos servicios.

## Técnica

- `src/app/lib/deliveryPartners.ts`: validación de enlaces por dominio (`parsePartners`, `partnersProblem`) y lista activa.
- Se guarda en `Tenant.settings.deliveryPartners` (sin migración), validado en `PATCH /api/admin/[tenant]`.
- `loadMenu` expone `deliveryPartners`. Componente `src/app/pedir/[tenant]/DeliveryPartners.tsx`.

## Cartas delivery: precios para cada plataforma (2026-11-10)

Carta → **Cartas delivery**. Las plataformas suelen llevar otros precios que el local.

- **Crear cartas:** tantas como se quiera (hasta 30).
  - **«+ Nueva carta»** empieza con los precios del local copiados; después se cambian a mano.
  - **«Duplicar»** copia otra carta (precios y platos quitados) para editar sobre ella. La copia no se lleva las plataformas.
- **Editar una carta:**
  - la descripción de cada plato en esa carta («✎ Cambiar la descripción»; vacía = la del local; `descriptions { productId: texto }`, migración `*_cartas_descripciones`; al duplicar se copia);
  - el nombre;
  - el precio de cada plato (vacío = el del local);
  - un interruptor para quitar los platos que no se venden en esas plataformas.
  - Todo se guarda solo, al salir del campo.
- **Asignar plataformas:** solo aparecen las **añadidas**, es decir, las que tienen su enlace en Configuración → Envío y entrega. Cada plataforma usa **una sola carta**: al asignarla a otra, se quita de la anterior. En la lista se ve qué carta usa cada plataforma y avisa si alguna está «sin carta».
- **Aún no se envía a las plataformas.** Cuando conectemos los pedidos de las plataformas (HubRise, ver docs/INTEGRACIONES.md), esta carta es la que se enviará a cada una y con la que se valorarán sus pedidos. Hasta entonces sirve de lista de precios de referencia.
- **Técnica:**
  - modelo `PriceList` con `name`, `channels`, `prices { productId: céntimos }` y `hidden`; migración `*_cartas_delivery`;
  - API `GET/POST /api/admin/[tenant]/cartas-delivery` y `PATCH/DELETE …/[id]`, solo el gerente; utilidades en `lib/priceLists.ts`;
  - pantalla `carta/CartasDelivery.tsx`.
