# Repartidor externo (Glovo On-Demand)

Fase 2 del reparto con plataformas (ver REPARTO-PLATAFORMAS.md). El cliente pide y paga en **nuestra tienda**, y solo se contrata el **repartidor** por viaje. No hay comisión sobre el pedido y el cliente sigue siendo del restaurante.

## Decisiones

- **Cada restaurante firma su contrato** con el proveedor y pega sus credenciales en el panel. El proveedor le cobra a él. La plataforma no toca dinero ni contratos.
- **El cliente paga el envío fijo de su zona** (Configuración → Zonas de reparto). Si el viaje cuesta más o menos, la diferencia la asume el restaurante. El panel muestra el coste de cada viaje.
- Hace falta tener **Delivery** activado y zonas de reparto.

## Proveedores

| Proveedor | Estado | Notas |
|---|---|---|
| **Modo prueba** | ✅ | Repartidor imaginario para probar sin contrato. Avanza solo: asignado al minuto, espera a que la cocina marque «Listo», recoge 1 min después y entrega a los 8 min. Cuesta «4,50 €» ficticios. |
| **Glovo On-Demand** | ✅ Listo para conectar | API On Demand Rider de Delivery Hero (https://on-demand-rider-docs.deliveryhero.io/). Servidor para España. |
| Uber Direct | Pendiente | Hay condiciones para España, pero no está confirmado que opere en Granada. Exige una prueba piloto con un local real. Se añade con la misma pieza. |
| Just Eat | No disponible | Su servicio parecido (JET Go) parece solo de Reino Unido. |

## Cómo se usa

1. Panel → **Configuración → Repartidor externo**: elegir «Modo prueba» o «Glovo On-Demand».
2. «Pedir el repartidor automáticamente al aceptar un pedido a domicilio» (activado por defecto). Si se desactiva, cada tarjeta muestra **🛵 Pedir repartidor**.
3. En **Pedidos**, la tarjeta muestra:
   - el estado («Buscando repartidor…», «Repartidor asignado», «Repartidor en el local», «Recogido · en camino», «Llegando al cliente», «Entregado»);
   - el coste del viaje, la hora de recogida y «Ver en el mapa»;
   - **Cancelar repartidor** (solo antes de que lo recoja) y **Pedir de nuevo** si falló.
4. Cuando el repartidor **recoge** el pedido, pasa solo a «En reparto». Cuando lo **entrega**, a «Entregado».
5. Si se cancela el pedido, se cancela también el repartidor. Glovo no deja cancelar si el repartidor ya lo ha aceptado: el panel lo avisa.
6. El cliente ve en el seguimiento «🛵 Tu pedido va de camino», la hora de llegada del repartidor y «Seguir en el mapa».

### Alta en Glovo On-Demand (lo hace el restaurante)

1. Pedir a Glovo el alta de empresa (On-Demand). Glovo da **Client ID**, **Key ID** y **Scope** (para España, normalmente `pandago.api.es.*`).
2. En el panel, **Generar claves** y enviar a Glovo la **clave pública**. La privada se guarda cifrada y no sale del servidor.
3. Pegar Client ID, Key ID y Scope. Empezar con el entorno **Pruebas de Glovo** y pasar a **Real** cuando funcione.
4. Dar a Glovo la **dirección de avisos** que muestra el panel (`/api/webhooks/couriers/glovo/[tenant]`) y pegar el **secreto de firma** que te den.
5. **Probar conexión**.

## Direcciones

Glovo necesita coordenadas. Se obtienen con CartoCiudad (IGN, gratis) a partir de «calle, número, ciudad»:
- **origen**: la dirección de Datos del negocio;
- **destino**: la del cliente.

Si no se encuentra el portal exacto, no se pide el repartidor y el panel avisa («No encuentro la dirección del cliente…»). Así nunca se manda a otra puerta. Lo que va detrás del número («2ºA») y las notas del pedido se envían al repartidor como indicaciones.

## Técnica

- Migración `20261017180000_courier_delivery`: tablas `CourierAccount` (una por restaurante) y `CourierDelivery` (una por pedido).
- `src/app/lib/couriers/`:
  - `types.ts`: estados comunes;
  - `simulated.ts`: modo prueba;
  - `glovo.ts`: token OAuth2 con JWT RS256, crear, consultar y cancelar viajes, traducción de estados y firma HMAC de los avisos;
  - `secrets.ts`: AES-256-GCM con una clave derivada de `SESSION_SECRET`. Si se cambia `SESSION_SECRET`, hay que volver a generar las claves y pegar el secreto;
  - `index.ts`: `requestCourier`, `syncCourier`, `cancelCourier` y `applyCourierPatch` (el pedido solo avanza);
  - `labels.ts`: textos del panel y del cliente.
- Se pide al aceptar el pedido (`PATCH /api/orders/status/[orderId]`) y se cancela al cancelarlo.
- **Seguimiento sin tareas programadas**: el panel (`GET /api/orders/[tenant]`) y la página del cliente (`GET /api/track/[orderId]`) ponen al día los viajes activos. A Glovo se le consulta como mucho una vez por minuto; los avisos (webhook) mandan.
- API del panel:
  - `GET/PUT/POST /api/admin/[tenant]/courier` (configuración, generar claves, probar conexión; solo gerentes);
  - `POST/DELETE /api/admin/[tenant]/courier/[orderId]` (pedir o cancelar; cualquier usuario que gestione pedidos).
- Webhook: `POST /api/webhooks/couriers/glovo/[tenant]`. Se rechaza (401) si la firma `X-Signature-SHA256` no cuadra con el secreto del restaurante.
- Privacidad: la política menciona que, con reparto externo, se comunican nombre, teléfono y dirección al proveedor.
