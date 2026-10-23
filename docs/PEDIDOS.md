# Tablero de pedidos

Panel → **Pedidos**. Cuatro columnas: **Nuevos → Preparando → Listos → En reparto** (solo a domicilio). Un pedido que se entrega o se cancela sale del tablero y pasa a «Últimas 24 h», abajo.

## Cambiar un pedido de estado

Hay dos formas de hacer lo mismo:

1. **El botón de la tarjeta** («Aceptar», «Marcar listo», «Enviar a reparto», «Entregado»). Es la vía principal: funciona en móvil, tablet y ordenador, con teclado y con pantalla táctil.
2. **Arrastrar la tarjeta** (solo en ordenador, con ratón, pantalla de 1024 px o más). Al coger una tarjeta:
   - la columna a la que puede ir se marca con un borde discontinuo y el texto «Suelta aquí · Aceptar» (o la acción que toque); las demás columnas se atenúan;
   - un pedido **listo** para recoger o **en reparto** no tiene columna siguiente: aparece una barra verde fija abajo, «Suelta aquí · Entregado»;
   - soltar hace exactamente lo mismo que el botón. Si el pedido está pendiente de cobro, al soltarlo en «Entregado» la tarjeta pregunta «¿Cómo ha pagado?» igual que el botón «Entregado y cobrar».

**Cancelar** sigue en el enlace «Cancelar» de la tarjeta, con confirmación, en Nuevos, Preparando y también en **Listos** (cliente que no viene a recoger). Al cancelar en Listos la comida ya está hecha, así que **no vuelve al stock**; el resto (cupón, tarjeta regalo, devolución online, rectificativa) se deshace igual. El cliente, desde su seguimiento, nunca puede cancelar un pedido listo.

Solo se puede arrastrar hacia delante (la transición que marca `nextAction`): no se retrocede un pedido ni se cancela arrastrando. Cancelar sigue en el enlace «Cancelar» de la tarjeta, con confirmación.

## Por qué no se arrastra en el móvil

En una pantalla táctil arrastrar y hacer scroll son el mismo gesto; las apps que lo permiten (Trello) obligan a mantener pulsado y aun así falla a menudo. Los paneles de cocina de referencia (Toast, Square, Deliverect) no arrastran: se toca un botón grande por pedido. Además, la pauta de accesibilidad WCAG 2.5.7 exige que todo lo que se haga arrastrando se pueda hacer también con un toque sencillo. Por eso en móvil y tablet las columnas son pestañas y la única acción es el botón.

## Técnica

- `pedidos/orderBoard.ts`: `dropTarget(order)` devuelve la columna destino (`NEW`/`PREPARING`/`READY`/`DELIVERING`) o `DONE` (zona «Entregado»), a partir de `nextAction`.
- `pedidos/AdminPanel.tsx`: arrastre nativo del navegador (`draggable`, `dragover`, `drop`), sin librerías. Se activa solo si `matchMedia("(min-width: 1024px) and (pointer: fine)")`. Estado `drag` (tarjeta y destino) y `over` (columna bajo el cursor). Al soltar llama a `handleStatus` como el botón; si hace falta cobrar, sube `payRequests[id]` y la tarjeta abre el selector de pago.
- `pedidos/OrderCard.tsx`: props `draggable`, `dragging`, `onDragStart`, `onDragEnd`, `payRequest`. Mientras se arrastra, la tarjeta original queda al 40 %.
