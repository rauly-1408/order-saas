# Promociones automáticas y tarjeta de fidelidad

Panel → **Clientes** → pestañas **Promociones** y **Fidelización**. Forman parte del motor de retención (addon `RETENTION`): sin él, ni el panel ni el checkout las aplican.

## Promociones automáticas

Descuentos que se aplican solos al pedir, sin código, y se anuncian en la carta.

| Tipo | Ejemplo |
|---|---|
| % de descuento | 15 % los martes para recoger |
| € de descuento | 3 € en pedidos desde 20 € |
| Envío gratis | Envío gratis a domicilio desde 25 € |

Condiciones opcionales: pedido mínimo, días de la semana, franja horaria (puede pasar de medianoche), solo domicilio o solo recogida, solo el primer pedido del cliente y fechas de inicio y fin. Días y horas se evalúan en la **hora del restaurante**.

## Tarjeta de fidelidad

Cada pedido suma un sello con el **teléfono** del cliente (sin registro). En el pedido nº N el premio se descuenta solo. Configuración de Estafetén propuesta: **en el 5.º pedido, bocadillo + bebida gratis**.

- El premio se define en grupos ("Bocadillo": molletes y burgers; "Bebida": bebidas). De cada grupo sale gratis el producto **más caro** que haya en el pedido.
- Solo el **precio de carta**: los extras (salsas, ingredientes) se cobran. Tope opcional en €.
- Si el pedido con premio no lleva nada de los grupos, el premio **se guarda** para el siguiente. Si lleva solo una parte (p. ej. el bocadillo sin bebida), se regala esa parte y el checkout avisa de que puede añadir la bebida gratis.
- Solo cuentan pedidos no cancelados hechos desde que se creó la tarjeta. Si se cancela el pedido del premio, el premio vuelve a estar disponible.
- Cálculo: sellos = pedidos sin premio − (N − 1) × premios canjeados; hay premio cuando sellos ≥ N − 1.

### Quién puede ver y canjear los sellos

- Al crear un pedido, el servidor deja una **cookie firmada** (`cp_<tenant>`, HMAC con `SESSION_SECRET`, un año, solo http) ligada al restaurante y al teléfono (`lib/customerProof.ts`).
- `POST /api/perks/[tenant]` solo devuelve «primer pedido» y los sellos si la petición trae esa cookie para ese teléfono; si no, `{ proven: false }`. Así nadie puede saber si un número es cliente ni cuántos sellos tiene con solo escribirlo.
- El **premio solo se canjea** en un pedido hecho desde un dispositivo con esa cookie. Los sellos se siguen sumando por teléfono desde cualquier sitio. En el checkout, sin cookie se enseña la tarjeta genérica (sin cuenta de sellos).
- Un pedido público **no cambia el nombre** de un cliente que ya existe.

## Cómo se combinan los descuentos

1. Primero el premio de la tarjeta.
2. Después **la mejor** entre las promociones en vigor y el cupón: no se acumulan; se aplica la que más ahorra. Si gana una promoción, el cupón no se gasta y el checkout lo explica.

El servidor recalcula todo al crear el pedido; el checkout solo lo enseña. `Order.discountCents` es el descuento total; el desglose está en `promotionDiscountCents` y `loyaltyDiscountCents` (el resto es del cupón).

## Dónde se ve

- **Carta:** tarjetas con las promociones en vigor y la tarjeta de fidelidad.
- **Checkout:** sellos del cliente al escribir su teléfono y desglose de descuentos.
- **Panel → Pedidos** y **confirmación del cliente:** desglose (premio, promoción, cupón).
- **Informes:** "Cupones y promociones" con usos e importe de cada uno; el CSV incluye columnas de promoción y premio.

## Técnica

- `src/app/lib/promotions.ts` — lógica pura (vigencia, mejor promoción, sellos, premio, desglose).
- `src/app/lib/perks.ts` — carga desde la base de datos y estado del cliente.
- `POST /api/perks/[tenant]` — público: `{ phone }` → `{ firstOrder, loyalty }`. El teléfono va en el cuerpo, no en la URL; solo devuelve contadores.
- Panel: `POST/PATCH /api/admin/[tenant]/retention/promotions`, `PUT /api/admin/[tenant]/retention/loyalty`.
- Migración `20261016180000_promotions_loyalty` (tablas `Promotion` y `LoyaltyProgram`, columnas nuevas en `Order`).
