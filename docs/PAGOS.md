# Pagos online (como Shopify: cada restaurante conecta su pasarela)

El dinero va **directamente a la cuenta del restaurante**. La plataforma nunca toca los cobros: el restaurante es el *merchant of record*. Sustituye al plan de Stripe Connect del Sprint 2.

## Cómo lo hace Shopify y cómo lo hacemos aquí

| Shopify | Aquí |
|---|---|
| Pasarelas de terceros: el comercio conecta su cuenta (bancos, PayPal, Stripe…) | **Redsys** (el TPV virtual de cualquier banco español, con **Bizum**) y **Stripe** (cuenta del propio restaurante) |
| Métodos manuales (efectivo, contra entrega) | **Pagar al recoger / al recibir** (activable) |
| Comisión extra por transacción con pasarelas de terceros, facturada aparte | **3 % por pedido pagado online** (`Tenant.platformFeeBps`), se apunta en `Order.applicationFeeCents` y se factura aparte a final de mes. Pagar en persona no lleva comisión |
| — | **Modo prueba**: página propia con «Pago correcto» / «Pago rechazado», sin cobrar |

Más adelante se pueden añadir PayPal u otras pasarelas con la misma pieza (`src/app/lib/gateways/`).

## Panel

**Configuración → Pagos** (Configuración está abajo en la barra lateral, por apartados como Shopify):
- **Pasarela**: Sin pago online / Redsys / Stripe / Modo prueba.
  - **Redsys**: código de comercio (FUC, 9 cifras), terminal, entorno (pruebas/real), clave secreta SHA-256 y «Ofrecer Bizum». Lo da el banco con el TPV virtual. La dirección de avisos se manda sola en cada pago.
  - **Stripe**: clave secreta (`sk_test_…` / `sk_live_…`) y, recomendado, el webhook (eventos `checkout.session.*`) con su secreto. Botón «Probar conexión».
- **Permitir también pagar al recoger o al recibir.**
- **Comisión de la plataforma**: pedidos online del mes, importe cobrado y comisión.
- Las claves se guardan **cifradas** (AES-256-GCM, `src/app/lib/secretBox.ts`) y nunca vuelven al navegador.

**Pedidos**:
- cada tarjeta dice «💳 Pagado», «Pagado con Bizum», «Cobrar al entregar / al recoger» o «Devuelto»;
- cancelar un pedido pagado online **devuelve el dinero** por la pasarela. Si la pasarela no lo acepta, el panel lo avisa para hacerlo desde su panel.

## Cliente

1. En el checkout, «¿Cómo pagas?»: 💳 Tarjeta (con Apple Pay / Google Pay en Stripe), 📱 Bizum y 💶 Al recoger / Al recibirlo. El botón dice «Pagar 21,40 €».
2. Se le lleva a la página de pago de la pasarela (Stripe Checkout o la del banco por Redsys).
3. Al volver (`/pedir/[tenant]/pago/[orderId]/vuelta`) se **comprueba con la pasarela**:
   - pagado → confirmación con «Pagado con tarjeta» y se vacía el carrito;
   - rechazado o cancelado → «El pago no se ha completado. No te hemos cobrado nada…» y «Volver a intentarlo», con el carrito intacto;
   - pendiente → «Confirmando tu pago…» y se vuelve a comprobar cada 3 s.

## Cómo funciona por dentro

- El pedido pagado online nace en **`AWAITING_PAYMENT`**: no sale en el tablero, no suena, no cuenta en informes, inicio, sellos, cupones ni retención.
- `finalizePayment` (idempotente):
  - **pagado** → `CREATED` + `PAID` + `paidAt` + comisión → llega a la cocina y suena;
  - **fallido** → `CANCELLED` + `FAILED`, y se deshace lo que hizo crear el pedido: stock, uso del cupón, compras del cliente y conversión de campaña.
- **Pagos abandonados**: a los 45 min sin confirmar se consulta una última vez y se cancelan (al refrescar el panel de pedidos, sin tareas programadas).
- **Pago tardío** (Redsys avisa de un pago de un pedido ya cancelado): se devuelve automáticamente.
- **Avisos** en `POST /api/webhooks/payments/[tenant]`:
  - Redsys: formulario firmado HMAC_SHA256_V1;
  - Stripe: cabecera `Stripe-Signature`, tolerancia 5 min.
  - Sin firma válida se rechazan.
- **Seguridad**:
  - el importe siempre lo calcula el servidor;
  - Redsys: se comprueba la firma, que el pedido de Redsys sea el último intento y que el importe coincida;
  - Stripe: se consulta la sesión guardada en el pedido, nunca la de la URL;
  - modo prueba: el resultado va firmado para que no se pueda marcar un pedido como pagado escribiendo la dirección a mano.
- Migración `20261018090000_payment_gateways`: `OrderStatus.AWAITING_PAYMENT`, `PaymentMethod.BIZUM`, `Order.paymentProvider/paymentRef/paidAt`, tabla `PaymentAccount`.
- Código: `src/app/lib/gateways/`:
  - `types.ts`;
  - `test.ts`, `stripe.ts`, `redsys.ts`;
  - `index.ts` (`paymentOptions`, `startPayment`, `verifyPayment`, `finalizePayment`, `expireStalePayments`, `refundOrder`).

## Comprobado

- **Redsys**: el entorno de pruebas real (`sis-t.redsys.es`) acepta nuestra firma con tarjeta y con Bizum, y muestra la pantalla de pago con importe, comercio y «Pedido #N».
- **Modo prueba**: pago correcto, pago rechazado (deshace compras del cliente y conserva el carrito), dirección falsificada sin efecto, y cancelación de un pedido pagado (→ «Devuelto»).

## Antes de cobrar de verdad

- Validar con un asesor el modelo fiscal y la factura de la comisión.
- Cada restaurante: pedir el TPV virtual (Redsys) a su banco o crear su cuenta de Stripe, y probar en el entorno de pruebas antes de pasar a «Real».
