# Pantallas táctiles

El panel se usa en iPads, tablets y ordenadores táctiles (TPV todo en uno).

## Arrastrar para desplazar (`(panel)/DragScroll.tsx`)

Muchas pantallas táctiles de ordenador se presentan a Windows como **un ratón**: el navegador recibe el dedo como un clic y, al arrastrar, **selecciona texto en vez de desplazar** (en el iPad no pasa porque allí sí es táctil).

`DragScroll` (montado en el layout del panel) lo arregla en todo el panel:

- Solo actúa con «ratón» (`pointerType === "mouse"`). El táctil de verdad lo sigue haciendo el navegador.
- Tras 8 px de arrastre desplaza el contenedor que hay debajo en ese sentido (las filas de categorías, la lista de productos, la página…), con inercia al soltar.
- No se selecciona texto mientras se arrastra (clase `drag-scrolling` en `globals.css`) y el clic de después no pulsa nada.
- Anula lo que empezó con el toque (p. ej. la pulsación larga de un producto en la Caja).
- No actúa sobre campos de texto, elementos `draggable` (tarjetas de Pedidos), `.touch-none` (plano de Mesas) ni `[data-no-drag-scroll]`.

Con un ratón de verdad también desplaza al arrastrar sobre una lista; para seleccionar texto, dentro de los campos de texto sigue funcionando.
