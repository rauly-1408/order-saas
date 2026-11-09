# Reservas

Reservas de mesa desde la tienda y apuntadas por el restaurante. Entrega 1: reservar y gestionar. Entrega 2: mesas, combinaciones y plano. Entrega 3: recordatorio el día antes y lista de espera.

## Qué ve el cliente

- **«📅 Reservar mesa»** en la portada de la carta, solo si el restaurante lo activa. También se puede compartir el enlace `/pedir/[tenant]/reservar`.
- **Una sola pantalla**:
  - cuántos son (hasta el máximo online; para más, «llámanos» con el teléfono del negocio);
  - qué día (hoy y los siguientes, hasta 30 en la fila);
  - qué hora (Por la mañana, Mediodía y Noche; las horas sin sitio salen tachadas);
  - sus datos: nombre, teléfono, email opcional y una nota.
- **Al reservar**: «¡Mesa reservada!» o «Solicitud enviada» si el restaurante confirma a mano. Le llega un email si dejó el suyo.
- **Su reserva** (`/pedir/[tenant]/reserva/[código]`, enlace del email): ve día, hora, personas y estado. Puede cancelarla en dos toques mientras sea futura.
- En español e inglés, como el resto de la tienda.

## Qué ve el restaurante

- **Día a día → Reservas** (quien tenga acceso a Mesas):
  - día anterior, Hoy, siguiente y calendario;
  - resumen: reservas, comensales y pendientes;
  - reservas agrupadas por hora, con nombre, personas, teléfono (se llama con un toque), nota y origen (Online, Teléfono o Sin reserva).
- **Botones por estado**:
  - pendiente: «Confirmar» o «Rechazar»;
  - confirmada: «Llegó», «No vino» o «Cancelar»;
  - llegó o no vino: «Deshacer».
  - Las canceladas se ven aparte y se pueden «Recuperar».
- **«+ Nueva reserva»**: por teléfono o para un cliente que llega sin reservar.
  - Ofrece las horas del día con las plazas libres y no aplica la antelación mínima.
  - Si no queda sitio, pregunta «¿Apuntarla igualmente?».
- Se refresca sola cada 30 segundos.
- **Avisos por email** al email de Información del negocio: reserva nueva online (o pendiente de confirmar) y reserva cancelada por el cliente.
- **Al cliente** (si dejó email): confirmación, «pendiente», confirmada por el restaurante y cancelada.

## Mesas de cada reserva (entrega 2)

- **Asignación automática**: al crear la reserva (online o en el panel) se le da la mejor opción libre a esa hora:
  1. la mesa suelta más ajustada al número de personas;
  2. si no hay, una **combinación** (por prioridad y tamaño);
  3. si nada encaja, queda «Sin mesa» (en ámbar) para elegirla a mano.
- **Ocupación**: una mesa está ocupada si la tiene otra reserva que se solapa. Si la reserva empieza en la próxima hora y media, también cuenta una mesa con la cuenta abierta.
- **En Reservas**: cada tarjeta dice «Mesa 5» o «Mesas 5 + 6». El botón **«Mesa»** abre la lista:
  - la sugerida, marcada;
  - el resto de mesas y combinaciones libres;
  - al final, las que se quedan cortas, por si se quieren juntar a mano;
  - «Quitar la mesa».
- **«Llegó»** abre la mesa con el nombre del cliente y sus comensales Si es una combinación, abre una sola cuenta con todas sus mesas («Mesas 1 + 2»); si alguna sigue ocupada, abre solo la primera y lo avisa. Si la primera ya estaba ocupada, avisa para abrirla a mano.
- **En el plano de Mesas**: una mesa libre con reserva hoy lleva **📅 21:00**. Al tocarla aparece la reserva con **«Sentar a Ana · 4 pax»**, que confirma si estaba pendiente, la marca como «Llegó», abre la mesa y pasa a tomar nota. **«Abrir para otros clientes»** la abre sin tocar la reserva.
- **Combinaciones** (Mesas → Editar mesas → **Combinaciones**):
  - elegir las mesas que se pueden unir (de cualquier zona);
  - mínimo y máximo de personas;
  - prioridad: Primero, Normal o Último;
  - no se repite la misma combinación.

## Recordatorio y lista de espera (entrega 3)

- **Recordatorio:**
  - cada mañana a las 9:00 UTC un cron de Vercel (`/api/cron/reservas-recordatorio`) manda un email a las reservas confirmadas con email de hoy (con más de 2 h por delante) y de mañana;
  - el email lleva el enlace a su reserva, con «Confirmo que vamos» y «Cancelar»;
  - en Reservas sale «Recordatorio enviado» y, si confirma, «✓ Confirmó que viene»;
  - se manda una sola vez (`reminderSentAt`).
- **Lista de espera:**
  - en la tienda, las horas completas salen tachadas pero se pueden tocar; el cliente se apunta con email obligatorio;
  - la reserva queda en estado WAITLIST: no ocupa sitio ni mesa;
  - cuando se cancela una reserva o se marca «No vino», se avisa por email a la gente en espera de ese día que ahora cabe, una vez por persona (`waitlistNotifiedAt`), con un enlace a reservar con el día y las personas ya elegidos;
  - en el panel, «Lista de espera (n)» con «Dar mesa» (comprueba el aforo, pregunta si está lleno y le busca mesa) y «Quitar».
- **Necesita:** la variable `CRON_SECRET` en Vercel (la misma del resumen diario) y el email configurado.

## Configuración → Reservas

| Ajuste | Por defecto |
|---|---|
| Aceptar reservas desde la tienda | Apagado |
| Confirmarlas al momento (si no, pendientes) | Encendido |
| Avisarme por email | Encendido |
| Recordatorio al cliente el día antes | Encendido |
| Lista de espera cuando esté completo | Encendido |
| Duración de cada mesa | 90 min |
| Aforo para reservas (0 = suma de plazas de las mesas; sin mesas, 30) | 0 |
| Máximo de personas por reserva online | 8 |
| Antelación mínima | 60 min |
| Reservar hasta | 30 días |
| Horas cada | 15 min |
| Mensaje para el cliente | — |

Las horas salen del **horario del local** (Horario y zonas): abierto al llegar y al menos 30 minutos más. Los cierres puntuales también bloquean. El aforo cuenta los comensales de las reservas que se solapan con la duración de una mesa.

## Técnica

- **Esquema:**
  - modelo `Reservation` (local, mesa opcional para la entrega 2, `code` público, `startsAt`, `durationMinutes`, personas, datos, estado y origen);
  - enums `ReservationStatus` (PENDING, CONFIRMED, SEATED, NO_SHOW, CANCELLED, WAITLIST) y `ReservationSource` (ONLINE, PHONE, WALKIN);
  - migración `20261109161514_reservas`;
  - ajustes en `Tenant.settings.reservations`;
  - entrega 3: `WAITLIST`, `reminderSentAt`, `customerConfirmedAt` y `waitlistNotifiedAt`, migración `*_reservas_recordatorio`;
  - entrega 2: `Reservation.tableIds` (mesa o mesas) y `Store.tableCombos` (`[{ id, tables, min, max, priority }]`), migración `*_reservas_mesas`.
- **Lógica:**
  - `lib/reservations.ts` (puro, con pruebas en `__tests__/reservations.test.ts`): ajustes, horas libres (`reservationSlots`) y ocupación (`guestsAt`).
  - `lib/reservationsDb.ts`: contexto y aforo, horas del día y `createReservation`. Comprueba el aforo dentro de una transacción con `pg_advisory_xact_lock` por local, para que dos reservas a la vez no se pasen.
  - Avisos por email con `notifyReservation` (plantillas en `lib/email.ts`).
  - `lib/tableCombos.ts` (puro, con pruebas): `readCombos` y `tableOptions`. `optionsFor` en `reservationsDb.ts` añade las mesas ocupadas.
- **API pública:**
  - `GET/POST /api/reservas/[tenant]`: horas libres y reservar (8 por minuto por IP);
  - `POST /api/reservas/[tenant]` con `waitlist: true` apunta a la lista de espera;
  - `POST /api/reservas/[tenant]/[code]` `{ action: "cancel" | "confirm" }`;
  - `GET /api/cron/reservas-recordatorio` con `Authorization: Bearer CRON_SECRET` (`sendReminders`).
- **API del panel:**
  - `GET/POST /api/admin/[tenant]/reservas`: día, horas para apuntar y nueva reserva (`force` para pasar del aforo);
  - `GET /api/admin/[tenant]/reservas/[id]`: opciones de mesa;
  - `PATCH /api/admin/[tenant]/reservas/[id]` `{ status }` (transiciones cerradas; «Llegó» abre la mesa) o `{ tableIds }`;
  - Mesas: el GET de `/api/admin/[tenant]/mesas` trae `combos` y `reservation` en cada mesa; el POST admite `combos`.
- **Pantallas:**
  - tienda: `pedir/[tenant]/reservar` y `pedir/[tenant]/reserva/[code]`;
  - panel: `(panel)/reservas` y `configuracion/reservas`.

## Pendiente

- Tarjeta en garantía o pago por adelantado para grupos.
- Recordatorio por SMS o WhatsApp (hoy solo email).
- **Reservar con Google:** Google tiene que aprobar a NorApp como socio.
