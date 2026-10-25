# Diseño de la tienda pública (carta)

`/pedir/[tenant]`. Toma como referencia la web de McDonald's: todo alineado a un mismo margen, portada a todo lo ancho y cada tipo de tarjeta con su propio aspecto. Los colores, las fuentes y las imágenes salen de **Configuración → Marca**.

## Estructura

1. **Franja de aviso** (solo con la tienda cerrada): «Ahora mismo estamos cerrados · abrimos hoy a las 20:00 · Puedes programar tu pedido».
2. **Cabecera fija y sólida**:
   - logo a la izquierda (el nombre solo se escribe si no hay logo);
   - a la derecha: estado Abierto/Cerrado, «A domicilio» (si se reparte con plataformas) y botón del pedido con el total y un contador.
3. **Portada a todo lo ancho**:
   - foto con zoom lento y velo oscuro a la izquierda para que se lea;
   - titular grande en la fuente de rótulo;
   - botones «Ver la carta» y «A domicilio».
4. **Categorías** fijas bajo la cabecera, alineadas con el contenido. La categoría activa se centra sola. En ordenador, al pasar el ratón por una categoría, esta se tiñe con el color de la marca.
5. **A domicilio** (si hay plataformas): bloque «Escoge quién te lo lleva».
6. **Promociones**: fila deslizante con la tarjeta de sellos y tarjetas de color, con el número grande («−15 %», «Envío gratis»), formas decorativas y un brillo al pasar el ratón. Alternan el color principal y el secundario.
7. **Menús (combos)**: tarjeta ancha con degradado del color principal, los pasos numerados («① Mollete + ② Bebida + ③ Postre»), «Todo por 12,50 €» y «Montar mi menú →». Los pasos son chips compactos (12 px). Los menús van en un **carrusel** (`MenuCarousel.tsx`): en el móvil se ven dos y se deslizan con el dedo; en ordenador se ven los que elija el dueño en Marca (2–5) y, con más, flechas y puntos. Las tarjetas estrechas (menos de 420 px) usan una versión compacta por *container query* (`@max-[420px]:`). Todas las tarjetas de la fila miden lo mismo (precio y botón pegados abajo).
8. **Productos**: tarjetas claras de 1, 2, 3 o 4 columnas según el ancho, botón «+ Añadir» y contador cuando ya está en el pedido. Los productos sin opciones se suman y restan desde la tarjeta.
9. **Pie** con el nombre y las redes.
10. **Barra flotante del pedido** con el total y «Ver pedido →».

## Animaciones

- Entrada escalonada del titular de la portada y zoom lento de la foto.
- Los bloques aparecen al hacer scroll (`data-reveal` + IntersectionObserver). Sin JavaScript se ven igual: solo se ocultan si el script está activo (`.s-js`).
- El total del pedido «salta» al añadir algo.
- Brillo en las promociones y regalo flotante en la tarjeta de sellos.
- Todo se desactiva con «reducir movimiento» del sistema (`prefers-reduced-motion`).

## Técnica

- `MenuClient.tsx`: estructura. `StoreCards.tsx`: `PromoTile`, `ComboCard` y `ProductCard`. `StampCard.tsx`: tarjeta de sellos.
- Animaciones: clases `s-*` en `globals.css`.

## Táctil (revisión del 2026-10-25)

Comprobado en el móvil con la pantalla táctil simulada.

- **Respuesta al dedo**: `TouchFeedback` (layout raíz) escucha `touchstart` para que Safari de iPhone aplique `:active`. Los botones (`p-press`) se hunden en cuanto se tocan.
- **Sin zoom involuntario**: `touch-action: manipulation` en botones y enlaces, para que un «+» pulsado rápido sume dos en vez de ampliar. Sin el destello gris de iOS. Los campos tienen al menos 16 px en pantallas táctiles, porque con menos Safari amplía la página al escribir (el pago tenía 15 px).
- **Hover solo con ratón**: `@media (hover: hover)`, para que no se queden «pegados» después de tocar.
- **Zonas de toque de 44 px o casi**: «−» y «+» de las tarjetas y del pago, categorías, ES/EN, la cesta de la cabecera, «Volver», «¿Tienes un cupón?», «Cómo llegar» y los enlaces del pie.
- **Barra de la cesta**: la barra entera lleva al pedido, con el número de productos, «Ver pedido» y el total. «Vaciar» ya no está en la barra, donde se tocaba sin querer: pasa al pago como «Vaciar pedido», junto a «+ Añadir más».
- **Hojas de opciones y menús** (`useSheetDrag`): en el móvil se cierran deslizando hacia abajo desde la cabecera, donde hay un tirador. La hoja sigue al dedo 1:1, resiste si se tira hacia arriba y, al soltar, proyecta la inercia del dedo (la misma deceleración que el scroll de iOS) para decidir si se cierra o vuelve. Se respeta «reducir movimiento».
- **Pago**: el botón de pagar va siempre a la vista abajo mientras se rellena el formulario, y las propinas caben en una sola fila.
- **Portada** más baja en el móvil, para que la carta empiece antes.
- **Confirmación**: un pedido cancelado muestra una X en el color de aviso, no la marca de «hecho».
