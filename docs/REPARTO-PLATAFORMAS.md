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
- Limitación: el pedido y el pago se hacen en la app de la plataforma. El carrito no se pasa, y ese cliente y la comisión (25-35 %) se quedan allí.

## Fase 2 — Pedido propio + repartidor externo (hecha: ver REPARTO-EXTERNO.md)

El cliente pide y paga en nuestra tienda (nos quedamos el cliente, sin comisión sobre el pedido) y solo se contrata el **repartidor** por viaje: Uber Direct, Glovo On-Demand o Stuart. Al aceptar el pedido se pide el repartidor, y el seguimiento muestra la llegada. Necesita una cuenta de empresa del restaurante con uno de esos servicios.

## Técnica

- `src/app/lib/deliveryPartners.ts`: validación de enlaces por dominio (`parsePartners`, `partnersProblem`) y lista activa.
- Se guarda en `Tenant.settings.deliveryPartners` (sin migración), validado en `PATCH /api/admin/[tenant]`.
- `loadMenu` expone `deliveryPartners`. Componente `src/app/pedir/[tenant]/DeliveryPartners.tsx`.
