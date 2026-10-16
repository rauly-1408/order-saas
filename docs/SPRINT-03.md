# Sprint 3 — Motor de retención (addon `RETENTION`)

**Objetivo:** que el restaurante sea dueño de sus clientes y los haga volver, algo que Last.app no ofrece en su terreno de operativa.
**Se vende aparte**, como Costes: sin el addon, la sección Clientes muestra la pantalla de "módulo opcional" y la API devuelve `402`.

## Fase 1 — ✅ (2026-10-16)

| Pieza | Qué hace |
|---|---|
| **Clientes** (`/admin/[tenant]/clientes`) | Ficha por teléfono creada en cada pedido. Segmentos **Nuevos / Habituales / VIP / En riesgo** como tarjetas-filtro, buscador y quién acepta ofertas. |
| **Segmento al día** | Se recalcula con la fecha actual al abrir Clientes y al crear una campaña. "En riesgo" (2+ pedidos y >30 días sin pedir) ya no espera a que el cliente vuelva a pedir. |
| **Cupones** | `%` o `€`, pedido mínimo, usos totales, caducidad y **un uso por cliente** (por teléfono). Se crean en Cupones o en un clic desde la campaña. Nunca se borran, solo se desactivan. |
| **Cupón en el checkout** | Campo "Cupón de descuento" (solo con el addon). La vista previa usa `GET /api/coupons/[tenant]`; el **servidor recalcula** el descuento al crear el pedido y reserva el uso de forma atómica. |
| **Campañas por WhatsApp** | Segmento + mensaje (plantilla por segmento con `{nombre}`, `{restaurante}`, `{enlace}`, `{cupon}`, `{descuento}`) + cupón. Vista previa como burbuja de WhatsApp. |
| **Envío** | Manual asistido: cada destinatario tiene "Enviar por WhatsApp" (`wa.me` con el texto personalizado) y queda marcado como enviado. Sin cuenta de WhatsApp Business todavía. |
| **Atribución** | Si el cliente pide en los **14 días** siguientes al mensaje, el envío pasa a `CONVERTED` con su pedido. Gana la campaña del cupón usado. La lista de campañas muestra enviados, clientes que volvieron e ingresos. |
| **Pedidos** | El tablero y la confirmación muestran el cupón y el descuento. La confirmación usa los importes guardados (antes ignoraba los suplementos). |

### Reglas legales y anti-saturación
- Solo reciben campañas los clientes con **consentimiento de marketing** (casilla del checkout, con fecha).
- El dueño puede **dar de baja** a un cliente, pero no darle de alta: el alta solo la da el cliente.
- Todo mensaje termina con *"Si no quieres recibir más mensajes, responde BAJA."*
- **Máximo una campaña por cliente y semana**, contando también los envíos pendientes de otra campaña en curso.

### Datos (migración `20261016090000_retention`, solo añade columnas)
- `Order.discountCents`, `Order.couponId`
- `Coupon.oncePerCustomer`
- `CampaignSend.convertedAt`, `CampaignSend.convertedOrderId` e índice `(customerId, status)`

Código: `src/app/lib/retention.ts` (lógica pura), `src/app/lib/retentionApi.ts` (guard y validación), `src/app/api/admin/[tenant]/retention/*`.

## Fase 2 — en curso
- [x] **IA que redacta el mensaje** (2026-10-16): botón "✨ Redactar con IA" en la campaña, con una idea opcional del dueño. Claude Opus 5.5 (esfuerzo `low`, salida JSON) devuelve 3 versiones según el grupo, el cupón y los 5 platos más pedidos de los últimos 60 días. Cada versión se valida en el servidor (lleva `{nombre}` y `{enlace}`, lleva `{cupon}` solo si hay cupón, sin texto de baja propio, ≤ 600 caracteres). Si el modelo declina, reintenta otro modelo (`fallbacks: "default"`). Límite: 30 redacciones al día por restaurante. Requiere `ANTHROPIC_API_KEY`; sin ella, el botón aparece desactivado. Código: `src/app/lib/aiCopy.ts`.
- [ ] **Envío automático** por WhatsApp Business API (Meta Cloud API o Twilio), con plantillas aprobadas y estado de entrega. Requiere la cuenta.
- [ ] Baja automática al recibir "BAJA" (webhook de WhatsApp).
- [ ] Campañas automáticas: cumpleaños, segundo pedido tras X días, recuperación cada mes.
- [ ] Enlace con el cupón ya aplicado (`/pedir/[tenant]?cupon=…`).
