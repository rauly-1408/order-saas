# Mesas

Primera versión (2026-10-24), hecha para Estafetén, que tiene sala. Mesas y barra en Interior, más la Terraza. El plano imita al TPV que usan ahora. Ver también `docs/CAJA.md`, `docs/IMPRESION.md` y `docs/VERIFACTU.md`.

## Qué ve el restaurante

- **Mesas** en el menú lateral. Lo usa cualquier usuario del restaurante, también los camareros con el rol «Pedidos».
- **Resumen de la sala** arriba: mesas ocupadas, comensales sobre plazas, mesas que piden la cuenta, la mesa que más tiempo lleva y, con «Ve lo recaudado», el importe abierto en mesas. En el móvil se desliza a los lados.
- **Filtros**: todas, libres, ocupadas y piden la cuenta. Las demás mesas se atenúan en el plano.
- **Mesas dibujadas**: cada mesa cuadrada lleva sus sillas, una por plaza (hasta 8), y los taburetes son redondos. Una mesa ocupada muestra los comensales, el tiempo con color (verde hasta 45 min, ámbar hasta 90 y rojo después) y las iniciales del camarero. Si pide la cuenta, se ve en ámbar con un «€» que parpadea.
- **Panel «Mesas abiertas»**: las mesas por orden de llegada, con comensales, productos, camarero, importe y tiempo. En el ordenador va a la derecha del plano y en el móvil, debajo.
- **Ficha de la mesa**: al tocar una mesa ocupada se ve el total, el tiempo, las rondas, quién la atiende y cuándo fue la última ronda. Tiene acciones rápidas: «+ Nueva ronda», «Cobrar», «Pedir cuenta» y «Ver cuenta». En el ordenador aparece en el panel y en el móvil sube desde abajo.
- **El plano por zonas**, con pestañas como Interior, Terraza o Barra:
  - Libre en blanco, ocupada en el color de la marca con el importe y los minutos, y «pide la cuenta» en ámbar.
  - Las mesas son cuadradas y los taburetes de barra, redondos.
  - Se refresca solo cada pocos segundos, así que lo que hace otro camarero aparece sin recargar.
  - El plano dibuja también la **barra**, las **paredes** y **textos** como «Entrada» o «Cocina».
  - Tiene siempre la misma proporción (4:3), como la pantalla del TPV. En el móvil se desplaza a los lados con el dedo, y las mesas mantienen un tamaño cómodo para tocarlas.
  - Una zona que aún no tiene plano se ve en cuadrícula.
- **Abrir una mesa**: se toca una mesa libre, se eligen los comensales y «Abrir y tomar nota» lleva directamente a la ronda. Una mesa abierta sin pedir muestra una tarjeta grande de «Tomar nota».
- **Nueva ronda**, pensada para pantalla táctil:
  - Usa la carta de la Caja, con opciones y menús, con botones y productos grandes.
  - En el ordenador o la tablet, el ticket de la ronda está siempre a la vista a la derecha: cantidad con botones grandes, papelera al quedar en 1 y nota por línea. En el móvil es una barra abajo que se despliega.
  - **Nota para cocina** al elegir las opciones de un producto o de un menú, y en cada línea del ticket, con atajos de un toque («Sin cebolla», «Poco hecha», «Salsa aparte»…) y texto libre. Sale en la comanda con «>>».
  - **Producto libre** (primera tarjeta de la carta): algo que no está en la carta, solo para esa cuenta. Tiene nombre, con ideas como «Chupito» o «Café», cantidad, precio y nota. **«Invita la casa»** lo deja a 0,00 € y escribe «Invita la casa» en la comanda y en el ticket. No descuenta stock. En la base de datos la línea lleva `productId = "LIBRE"`, y los informes la agrupan por nombre.
  - «Enviar a cocina» la añade a la cuenta e imprime su comanda («MESA 4 · Ronda 2», solo con lo nuevo).
  - El stock se descuenta en cada ronda.
- **La cuenta**:
  - Muestra las rondas con la hora y quién las tomó, el total y lo ya cobrado por separado.
  - **Botones grandes para el dedo**:
    - En tablet y ordenador, cuando la cuenta tiene 42rem o más, hay un **panel de cobro fijo a la derecha**. Muestra el total en grande y debajo, de 80 px de alto, «+ Nueva ronda» y «Cobrar»; luego «Pedir cuenta» y, aparte y en pequeño, «Cambiar de mesa» y «Cerrar sin cobrar».
    - Las rondas hacen scroll y el panel no se mueve.
    - En el móvil, una barra fija abajo con el total, «Pedir cuenta» y, de 64 px, «+ Nueva ronda» y «Cobrar».
  - **Pedir cuenta** imprime la cuenta («No es una factura») y marca la mesa como «pide la cuenta». Arriba sale «Cuenta pedida · hora» y el botón pasa a «Repetir cuenta».
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
  - **+ Barra, + Pared y + Texto**: elementos fijos que se arrastran y se estiran desde la esquina. Al tocarlos se cambia su texto o se quitan. Una barra alta y estrecha escribe su texto en vertical.
  - Si se sale del editor o se cambia de zona con cambios sin guardar, avisa.
  - **Tocar una mesa** para cambiarle el nombre, la zona, las plazas o la forma, o quitarla. Si tiene historial se desactiva en vez de borrarse.

**Sin conexión.** Si se cae internet se sigue trabajando: ver el plano y las cuentas, abrir mesas, tomar nota, pedir la cuenta, cobrar y cambiar de mesa. Se guarda en el aparato y se envía solo al volver, en orden y sin duplicarse. Ver `docs/SIN-CONEXION.md`.

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
  - `20261024130000_mesas_elementos`: `Store.floorPlan`, con los elementos fijos por zona: `{ "Interior": [{ id, kind: BAR | WALL | LABEL, x, y, w, h, label }] }` en % del plano. Se guarda la zona entera con la acción `fixtures`.
- `lib/tables.ts` reúne la lógica:
  - Abrir, añadir ronda, anular, pedir la cuenta, cobrar (entera o por unidades), mover y cerrar.
  - Cálculos puros, probados en `lib/__tests__/tables.test.ts`: `splitLineAmounts`, `equalShares` y `tableNames`.
- `GET/POST /api/admin/[tenant]/mesas`:
  - El GET devuelve el plano.
  - El POST admite `open` para cualquier usuario, y `add`, `update`, `remove`, `layout` y `fixtures` solo para el gerente.
- `GET/POST /api/admin/[tenant]/mesas/[orderId]`:
  - El GET devuelve la cuenta.
  - El POST admite `round`, `void` (gerente), `bill`, `pay`, `move` y `cancel`.
- **Impresión**: `renderKitchen(o, p, { round | voided })`, la cuenta previa en `renderReceipt`, `enqueueTablePrint` y `printTablePayment`.
- **Pantalla**: `mesas/MesasClient.tsx` (zonas, editor y fichas), `mesas/SalaView.tsx` (sala en servicio: resumen, filtros, mesas con sillas, panel y ficha), `CuentaView.tsx` (cuenta y cobro), `RoundComposer.tsx` (ronda) y `shared.tsx`.

## Pendiente

- Juntar mesas y pasar parte de una cuenta a otra mesa.
- Propinas por camarero y un informe por camarero.
- Pantalla de cocina en lugar de papel.
- Reservas.
