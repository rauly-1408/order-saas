# Mesas

Primera versión (2026-10-24), hecha para Estafetén, que tiene sala. Mesas y barra en Interior, más la Terraza. El plano imita al TPV que usan ahora. Ver también `docs/CAJA.md`, `docs/IMPRESION.md` y `docs/VERIFACTU.md`.

## Qué ve el restaurante

- **Mesas** en el menú lateral. Lo usa cualquier usuario del restaurante, también los camareros con el rol «Pedidos».
- **El plano por zonas**, con pestañas como Interior, Terraza o Barra:
  - Libre en blanco, ocupada en el color de la marca con el importe y los minutos, y «pide la cuenta» en ámbar.
  - Las mesas son cuadradas y los taburetes de barra, redondos.
  - Se refresca solo cada pocos segundos, así que lo que hace otro camarero aparece sin recargar.
  - Una zona que aún no tiene plano se ve en cuadrícula.
- **Abrir una mesa**: se toca una mesa libre, se eligen los comensales y se abre su cuenta.
- **Nueva ronda**:
  - Usa la carta de la Caja, con opciones, menús y una nota por línea.
  - «Enviar a cocina» la añade a la cuenta e imprime su comanda («MESA 4 · Ronda 2», solo con lo nuevo).
  - El stock se descuenta en cada ronda.
- **La cuenta**:
  - Muestra las rondas con la hora y quién las tomó, el total y lo ya cobrado por separado.
  - **Cuenta** imprime la cuenta («No es una factura») y marca la mesa como «pide la cuenta».
  - **Anular** una línea ya enviada (solo el gerente) imprime en cocina «ANULADO · NO PREPARAR». El stock no vuelve, porque puede estar hecho.
  - **Cambiar de mesa** la pasa a una mesa libre del mismo local.
  - **Cerrar sin cobrar** sirve para una mesa abierta por error. Con consumo, solo la cierra el gerente, y el stock vuelve.
- **Cobrar**:
  - **Todo**: la cuenta entera.
  - **Por productos**: se marca lo que paga cada persona, por unidades. Esa parte se cobra como un pedido propio, con su forma de pago y su factura, y el resto sigue en la mesa.
  - **A partes iguales**: calcula cuánto paga cada uno y cobra la cuenta entera de una vez. Si cada uno paga de una forma distinta, se usa «Por productos».
  - Formas de pago: efectivo (con importes rápidos y cambio), datáfono y Bizum. Al cobrarlo todo, la mesa queda libre.
- **Editar mesas** (gerente):
  - **Añadir mesas** de golpe: zona, letra opcional, desde y hasta, plazas y forma. Por ejemplo, Interior del 1 al 11 o Barra del B1 al B3 redondas.
  - **Colocar** las mesas arrastrándolas en el plano y pulsar «Guardar plano».
  - **Tocar una mesa** para cambiarle el nombre, la zona, las plazas o la forma, o quitarla. Si tiene historial se desactiva en vez de borrarse.

## Reglas

- **Una cuenta abierta por mesa.** Si dos camareros abren la misma mesa a la vez, el segundo ve «La mesa 4 ya está abierta». Lo frenan un índice único en la base de datos (`Order_open_table_key`) y la comprobación previa.
- **Dos camareros en la misma cuenta.** Cada ronda, anulación o cobro bloquea la cuenta mientras actúa (`SELECT … FOR UPDATE`). Dos rondas a la vez salen como ronda 1 y ronda 2. Si se cobra dos veces a la vez, el segundo ve «Esta mesa ya se ha cobrado».
- **Totales**: se recalculan siempre a partir de las líneas. Al dividir una línea, el importe se reparte sin perder céntimos.
- **VeriFactu**: cada cobro, sea la cuenta entera o una parte, emite su factura simplificada, igual que la Caja. La cuenta previa no es una factura.
- **Fuera del tablero de Pedidos**: una mesa abierta no aparece en el tablero, no hace sonar la campanilla y no se puede cobrar desde Pedidos. Cuando se cobra, pasa a Entregado y cuenta en «Hoy en caja», en el cierre de caja y en los informes.
- **Inicio e informes**: cuentan las mesas abiertas en las ventas del día, como los pedidos que se pagan al recoger.

## Técnica

- **Esquema**:
  - Modelo `DiningTable`: local, nombre, zona, plazas, orden, activa, `posX` y `posY` (en % del plano de su zona) y `shape` (SQUARE o ROUND).
  - `Order`: `tableId`, `guests` y `billRequestedAt`, más el estado `OPEN` y el origen `TABLE`.
  - `OrderLine`: `round` y `addedByUserId`.
- **Migraciones**:
  - `20261024120000_mesas`.
  - `20261024120100_mesas_una_abierta`: índice único parcial, que Prisma no sabe expresar en el esquema. Si una migración futura intenta borrarlo, hay que quitar esa línea.
  - `20261024120200_mesas_plano`.
- `lib/tables.ts` reúne la lógica:
  - Abrir, añadir ronda, anular, pedir la cuenta, cobrar (entera o por unidades), mover y cerrar.
  - Cálculos puros, probados en `lib/__tests__/tables.test.ts`: `splitLineAmounts`, `equalShares` y `tableNames`.
- `GET/POST /api/admin/[tenant]/mesas`:
  - El GET devuelve el plano.
  - El POST admite `open` para cualquier usuario, y `add`, `update`, `remove` y `layout` solo para el gerente.
- `GET/POST /api/admin/[tenant]/mesas/[orderId]`:
  - El GET devuelve la cuenta.
  - El POST admite `round`, `void` (gerente), `bill`, `pay`, `move` y `cancel`.
- **Impresión**: `renderKitchen(o, p, { round | voided })`, la cuenta previa en `renderReceipt`, `enqueueTablePrint` y `printTablePayment`.
- **Pantalla**: `mesas/MesasClient.tsx` (plano y editor), `CuentaView.tsx` (cuenta y cobro), `RoundComposer.tsx` (ronda) y `shared.tsx`.

## Pendiente

- Juntar mesas y pasar parte de una cuenta a otra mesa.
- Propinas por camarero y un informe por camarero.
- Pantalla de cocina en lugar de papel, e impresora de bebidas por categoría.
- Dibujar elementos fijos en el plano, como la barra o las paredes.
- Reservas.
- Modo sin conexión: un servicio lleno no puede depender de la wifi, así que de momento conviene un router 4G de respaldo.
