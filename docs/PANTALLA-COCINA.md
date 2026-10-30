# Pantalla de cocina

Una pantalla a pantalla completa para la tablet o la tele de cocina o de barra. Sustituye al papel o lo acompaña: las comandas se siguen imprimiendo igual.

## Qué ve el restaurante

- **Dónde**: menú → Día a día → **Pantalla de cocina** (`/admin/[tenant]/cocina`). Los puestos de Cocina y Barra entran directamente en ella.
- **Qué sale**:
  - Los pedidos de la tienda online y de la Caja que aún no están listos (nuevos, aceptados o en preparación).
  - Las **rondas de las mesas**, una tarjeta por ronda («Mesa 4 · Ronda 2»), con el nombre de la mesa y los comensales.
- **Cocina y barra por separado**: cada pantalla ve solo las líneas de sus secciones de la carta, las mismas que deciden qué impresora imprime cada cosa. Lo que no tiene sección (líneas libres) va a cocina. El gerente, el encargado y la caja eligen arriba qué ver: Todo, Cocina o Barra (se recuerda en ese aparato).
- **Tarjetas**: de la más antigua a la más nueva. El tiempo que lleva cada comanda se ve en la cabecera: verde hasta 10 min, ámbar hasta 20 y rojo a partir de 20. Cantidad grande, producto, opciones y la nota de cocina en naranja.
- **Tachar**: tocar una línea la tacha en esa pantalla (para llevar la cuenta de lo hecho); no cambia nada más.
- **Botones**:
  - Pedido nuevo o aceptado → **Empezar** (pasa a «En preparación»).
  - Pedido en preparación → **✓ Listo** (pasa a «Listo», como en el tablero de Pedidos, con sus avisos al cliente).
  - Ronda de mesa → **✓ Listo**: marca listas solo las líneas de esa pantalla; lo de barra sigue pendiente en barra.
- **En la mesa**: el camarero ve en la cuenta, junto a cada ronda, «✓ Lista» o «Lista en parte».
- **Sonido**: «Activar sonido» hace sonar un aviso cuando entra una comanda nueva (el navegador exige tocar una vez para permitir el sonido).
- Se refresca sola cada 5 segundos. Si se cae internet avisa y deja a la vista lo último que llegó.

## Técnica

- `OrderLine.readyAt` (migración `20261030140000_pantalla_cocina`): cuándo la cocina o la barra marcó lista la línea.
- `lib/kitchen.ts`: `kitchenTickets` (comandas para una vista o puesto) y `markRoundReady`.
- `GET /api/admin/[tenant]/cocina?vista=COCINA|BARRA|TODO` → `{ station, tickets }`; `POST { orderId, round, vista }` → `{ marked }`. Requiere el área Pedidos.
- Los pedidos cambian de estado con `PATCH /api/orders/status/[orderId]`, igual que el tablero.
- `cocina/page.tsx` y `cocina/KdsClient.tsx`. Los puestos Cocina y Barra tienen `home: "cocina"` en `lib/roles.ts`.

## Pendiente

- Avisar al camarero (sonido o aviso en el móvil) cuando su ronda está lista.
- Tiempos medios de preparación en Informes.
