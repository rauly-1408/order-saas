# Reservas

Reservas de mesa desde la tienda y apuntadas por el restaurante. Entrega 1: reservar y gestionar. Las entregas 2 (mesas y combinaciones) y 3 (recordatorios y lista de espera) están en «Pendiente».

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

## Configuración → Reservas

| Ajuste | Por defecto |
|---|---|
| Aceptar reservas desde la tienda | Apagado |
| Confirmarlas al momento (si no, pendientes) | Encendido |
| Avisarme por email | Encendido |
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
  - enums `ReservationStatus` (PENDING, CONFIRMED, SEATED, NO_SHOW, CANCELLED) y `ReservationSource` (ONLINE, PHONE, WALKIN);
  - migración `20261109161514_reservas`;
  - ajustes en `Tenant.settings.reservations`.
- **Lógica:**
  - `lib/reservations.ts` (puro, con pruebas en `__tests__/reservations.test.ts`): ajustes, horas libres (`reservationSlots`) y ocupación (`guestsAt`).
  - `lib/reservationsDb.ts`: contexto y aforo, horas del día y `createReservation`. Comprueba el aforo dentro de una transacción con `pg_advisory_xact_lock` por local, para que dos reservas a la vez no se pasen.
  - Avisos por email con `notifyReservation` (plantillas en `lib/email.ts`).
- **API pública:**
  - `GET/POST /api/reservas/[tenant]`: horas libres y reservar (8 por minuto por IP);
  - `POST /api/reservas/[tenant]/[code]` `{ action: "cancel" }`.
- **API del panel:**
  - `GET/POST /api/admin/[tenant]/reservas`: día, horas para apuntar y nueva reserva (`force` para pasar del aforo);
  - `PATCH /api/admin/[tenant]/reservas/[id]` `{ status }`, con transiciones cerradas.
- **Pantallas:**
  - tienda: `pedir/[tenant]/reservar` y `pedir/[tenant]/reserva/[code]`;
  - panel: `(panel)/reservas` y `configuracion/reservas`.

## Pendiente

- **Entrega 2:**
  - asignar mesa con sugerencia por personas;
  - combinaciones de mesas (mínimo, máximo y prioridad);
  - ver las reservadas en el plano y «Sentar» para abrir la mesa.
- **Entrega 3:**
  - recordatorio el día antes con confirmar o cancelar;
  - lista de espera cuando no hay sitio;
  - tarjeta en garantía o pago por adelantado para grupos.
- **Reservar con Google:** Google tiene que aprobar a NorApp como socio.
